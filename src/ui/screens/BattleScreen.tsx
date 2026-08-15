/**
 * バトル画面（仕様書 3.2 のレイアウトを縦画面へ落とし込んだもの）
 *
 *   [相手ステータス] → [相手施設] → [相手前衛]
 *                    バトルエリア
 *   [自分前衛] → [自分施設] → [自分ステータス]
 *   [プロンプト（分配 / 対象選択 / 応答 / 捨て札）]
 *   [手札] [ターン終了]
 *
 * 操作要素は下1/3に集約し、ターン終了は右下の親指位置に置く。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Heart, Minus, Plus, ScrollText, Swords, X } from 'lucide-react';
import { CardSheet, FacilityChip, HandCard, ResourceIcon, UnitChip } from '../components/pieces';
import { useBattle, type BattleConfig } from '../useBattle';
import { getCard } from '../../cards/cardFactory';
import { canPay, costOptions, formatCost, paidResourceOf } from '../../cards/baseCard';
import { entryEffects, legalTargets, requiresTarget, targetSpecOf } from '../../core/effects';
import { legalAttackTargets, playableCards } from '../../core/mainPhaseEngine';
import { RESOURCE_KINDS, RESOURCE_LABEL } from '../../core/types';
import type {
  CardDef,
  GameState,
  PlayerId,
  PlayerState,
  ResourceKind,
  TargetRef,
  TargetSpec,
} from '../../core/types';

interface Props {
  config: BattleConfig;
  onExit: () => void;
}

/** 進行中の複数ステップ操作（カードプレイ／攻撃／施設起動） */
type Pending =
  | {
      kind: 'playCard';
      uid: string;
      def: CardDef;
      /** 支払い方が複数あるカード（錬金術）は未選択のうちは undefined */
      costOption?: number;
      specs: TargetSpec[];
      targets: TargetRef[];
      resource?: ResourceKind;
    }
  | { kind: 'attack'; attackerUid: string }
  | { kind: 'activate'; facilityUid: string; def: CardDef; resource?: ResourceKind }
  | null;

/** オークション解決直後に表示する「どちらが先攻か」バナーの内容 */
interface FirstBannerInfo {
  amIFirst: boolean;
  firstName: string;
  firstBid: number;
  secondName: string;
  secondBid: number;
}

export function BattleScreen({ config, onExit }: Props) {
  const battle = useBattle(config);
  const { state, dispatch } = battle;
  const me = config.mySide;
  const foe: PlayerId = me === 0 ? 1 : 0;

  const [pending, setPending] = useState<Pending>(null);
  const [sheet, setSheet] = useState<CardDef | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [discardPick, setDiscardPick] = useState<string[]>([]);
  const [alloc, setAlloc] = useState({ fund: 0, mana: 0, aether: 0, draw: 0 });
  const [bid, setBid] = useState(0);
  const [firstBanner, setFirstBanner] = useState<FirstBannerInfo | null>(null);

  const myPlayer = state.players[me];
  const foePlayer = state.players[foe];
  const isMyTurn = state.active === me;

  // フェイズが変わったら進行中の操作をリセットする
  useEffect(() => {
    setPending(null);
    setDiscardPick([]);
    if (state.phase === 'allocate') setAlloc({ fund: 0, mana: 0, aether: 0, draw: 0 });
  }, [state.phase, state.turn]);

  // オークション解決直後（ターン1開始時）に、どちらが先攻かをはっきり示す。
  // 自動消滅用のタイマーは ref で持ち回り、effectのクリーンアップに乗せない。
  // 乗せると「ターンが1→2へ進む」だけで（AIが先攻で素早く1ターン目を終えた場合など）
  // クリーンアップが走ってタイマーがキャンセルされ、バナーが消えなくなるバグを踏んだため。
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (state.turn !== 1) return;
    const first = state.players[state.active];
    const second = state.players[state.active === 0 ? 1 : 0];
    setFirstBanner({
      amIFirst: state.active === me,
      firstName: first.name,
      firstBid: first.bid,
      secondName: second.name,
      secondBid: second.bid,
    });
    clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = setTimeout(() => setFirstBanner(null), 3200);
    // ターンが1になった瞬間だけ発火させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn]);
  useEffect(() => () => clearTimeout(bannerTimeoutRef.current), []);

  // 被弾（HP減少）した対象を一瞬だけ光らせる。「いきなり事象が起きて分からない」を
  // 減らすための最小限の演出で、召喚は .chip のマウントアニメ（CSS側）に任せている。
  const prevHpRef = useRef<Map<string, number>>(new Map());
  const flashTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [hitIds, setHitIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevHpRef.current;
    const next = new Map<string, number>();
    const hit: string[] = [];
    for (const player of state.players) {
      const baseKey = `base:${player.id}`;
      next.set(baseKey, player.baseHp);
      if (prev.has(baseKey) && prev.get(baseKey)! > player.baseHp) hit.push(baseKey);
      for (const u of player.units) {
        next.set(u.uid, u.hp);
        if (prev.has(u.uid) && prev.get(u.uid)! > u.hp) hit.push(u.uid);
      }
      for (const f of player.facilities) {
        next.set(f.uid, f.hp);
        if (prev.has(f.uid) && prev.get(f.uid)! > f.hp) hit.push(f.uid);
      }
    }
    prevHpRef.current = next;
    if (hit.length === 0) return;
    setHitIds((prevSet) => new Set([...prevSet, ...hit]));
    for (const id of hit) {
      clearTimeout(flashTimeoutsRef.current.get(id));
      flashTimeoutsRef.current.set(
        id,
        setTimeout(() => {
          setHitIds((prevSet) => {
            if (!prevSet.has(id)) return prevSet;
            const next = new Set(prevSet);
            next.delete(id);
            return next;
          });
        }, 450),
      );
    }
    // stateそのものではなくログ長で見ると余計な再判定を避けられるが、
    // HPは分配・応答など他フェイズの遷移でも変わりうるためstate全体を見る
  }, [state]);
  useEffect(
    () => () => flashTimeoutsRef.current.forEach((t) => clearTimeout(t)),
    [],
  );

  const playableUids = useMemo(() => {
    if (state.phase !== 'main' || !isMyTurn) return new Set<string>();
    return new Set(playableCards(state, me).map((p) => p.uid));
  }, [state, me, isMyTurn]);

  // --- いま選択できる対象の一覧 ---
  const activeTargets: TargetRef[] = useMemo(() => {
    if (!pending) return [];
    if (pending.kind === 'attack') {
      const unit = myPlayer.units.find((u) => u.uid === pending.attackerUid);
      return unit ? legalAttackTargets(state, unit) : [];
    }
    if (pending.kind === 'playCard') {
      if (pending.costOption === undefined) return [];
      const spec = pending.specs[pending.targets.length];
      return spec ? legalTargets(state, me, spec, pending.def.type === 'spell') : [];
    }
    if (pending.kind === 'activate') {
      const ability = pending.def.activated;
      if (!ability || ability.kind === 'convertResource') return [];
      return legalTargets(state, me, ability.target, false);
    }
    return [];
  }, [pending, state, me, myPlayer.units]);

  const isTargetable = (ref: TargetRef): boolean =>
    activeTargets.some((t) => sameRef(t, ref));

  // -------------------------------------------------------------------------
  // 操作ハンドラ
  // -------------------------------------------------------------------------

  /** 対象・リソース選択が揃ったら実際にアクションを送る */
  const commit = (p: NonNullable<Pending>) => {
    if (p.kind === 'playCard') {
      if (p.costOption === undefined) return;
      const needsResource = entryEffects(p.def).some((e) => e.kind === 'gainResource');
      if (p.targets.length < p.specs.length) return;
      if (needsResource && !p.resource) return;
      if (dispatch({
        type: 'playCard',
        uid: p.uid,
        costOption: p.costOption,
        targets: p.targets,
        chosenResource: p.resource,
      })) {
        setPending(null);
      }
      return;
    }
    if (p.kind === 'activate') {
      const ability = p.def.activated;
      if (!ability) return;
      if (ability.kind === 'convertResource' && !p.resource) return;
      if (dispatch({ type: 'activate', facilityUid: p.facilityUid, chosenResource: p.resource })) {
        setPending(null);
      }
    }
  };

  const tapHandCard = (uid: string) => {
    if (state.phase === 'discard') {
      setDiscardPick((prev) =>
        prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
      );
      return;
    }
    if (state.phase !== 'main' || !isMyTurn) return;
    if (pending?.kind === 'playCard' && pending.uid === uid) {
      setPending(null);
      return;
    }
    if (!playableUids.has(uid)) return;

    const card = myPlayer.hand.find((c) => c.uid === uid);
    if (!card) return;
    const def = getCard(card.defId);

    // 支払い方が複数あるカード（錬金術）は、いま払える選択肢が1通りだけなら自動採用、
    // 複数あるならプレイヤーに選んでもらう（勝手に資金優先で決めない）
    const options = costOptions(def);
    const affordable = options
      .map((_, i) => i)
      .filter((i) => canPay(myPlayer.resources, options[i]));
    if (affordable.length === 0) return;
    const costOption = affordable.length === 1 ? affordable[0] : undefined;

    const specs = entryEffects(def).filter(requiresTarget).map(targetSpecOf);
    const next: Pending = { kind: 'playCard', uid, def, costOption, specs, targets: [] };
    const needsResource = entryEffects(def).some((e) => e.kind === 'gainResource');
    if (costOption !== undefined && specs.length === 0 && !needsResource) {
      if (dispatch({ type: 'playCard', uid, costOption })) setPending(null);
      return;
    }
    setPending(next);
  };

  const tapTarget = (ref: TargetRef) => {
    if (!pending || !isTargetable(ref)) return;

    if (pending.kind === 'attack') {
      if (dispatch({ type: 'attack', attackerUid: pending.attackerUid, target: ref })) {
        setPending(null);
      }
      return;
    }
    if (pending.kind === 'playCard') {
      const targets = [...pending.targets, ref];
      const next = { ...pending, targets };
      const needsResource = entryEffects(pending.def).some((e) => e.kind === 'gainResource');
      if (targets.length >= pending.specs.length && !needsResource) {
        commit(next);
      } else {
        setPending(next);
      }
      return;
    }
    if (pending.kind === 'activate') {
      if (dispatch({ type: 'activate', facilityUid: pending.facilityUid, target: ref })) {
        setPending(null);
      }
    }
  };

  const tapMyUnit = (uid: string) => {
    if (state.phase !== 'main' || !isMyTurn) return;
    if (pending?.kind === 'attack' && pending.attackerUid === uid) {
      setPending(null);
      return;
    }
    // 自軍ユニットが効果の対象になっている場合はそちらを優先（武器庫の起動など）
    if (pending && isTargetable({ kind: 'unit', uid })) {
      tapTarget({ kind: 'unit', uid });
      return;
    }
    const unit = myPlayer.units.find((u) => u.uid === uid);
    if (!unit) return;
    const frozen = unit.frozenUntilTurn !== undefined && state.turn <= unit.frozenUntilTurn;
    if (unit.hasAttacked || frozen) {
      setSheet(getCard(unit.defId));
      return;
    }
    setPending({ kind: 'attack', attackerUid: uid });
  };

  const tapMyFacility = (uid: string) => {
    if (pending && isTargetable({ kind: 'facility', uid })) {
      tapTarget({ kind: 'facility', uid });
      return;
    }
    const facility = myPlayer.facilities.find((f) => f.uid === uid);
    if (!facility) return;
    const def = getCard(facility.defId);
    if (state.phase !== 'main' || !isMyTurn || !def.activated) {
      setSheet(def);
      return;
    }
    if (facility.activatedThisTurn >= def.activated.perTurn) {
      setSheet(def);
      return;
    }
    const next: Pending = { kind: 'activate', facilityUid: uid, def };
    if (def.activated.kind === 'convertResource') {
      setPending(next);
      return;
    }
    setPending(next);
  };

  const cancelPending = () => setPending(null);

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------

  const allocTotal = alloc.fund + alloc.mana + alloc.aether + alloc.draw;
  const allocRemain = state.rules.FREE_POINTS - allocTotal;
  const discardNeed = Math.max(0, myPlayer.hand.length - state.rules.HAND_LIMIT);

  return (
    <div className="screen battle">
      <div className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label="戻る">
          <ChevronLeft size={18} />
        </button>
        <h1>ターン {state.turn}</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {battle.aiThinking && state.winner === null && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>相手思考中…</span>
          )}
          <button className="icon-btn" onClick={() => setShowLog(true)} aria-label="ログ">
            <ScrollText size={16} />
          </button>
        </div>
      </div>

      <StatusBar player={foePlayer} side="foe" hit={hitIds.has(`base:${foe}`)} />

      <div className="board">
        <div className="board-foe">
        <Zone label="相手施設">
          {renderSlots(foePlayer.facilities.length, state.rules.MAX_FACILITIES, (i) => {
            const f = foePlayer.facilities[i];
            return (
              <FacilityChip
                key={f.uid}
                facility={f}
                mode={isTargetable({ kind: 'facility', uid: f.uid }) ? 'targetable' : 'idle'}
                hit={hitIds.has(f.uid)}
                onTap={() =>
                  isTargetable({ kind: 'facility', uid: f.uid })
                    ? tapTarget({ kind: 'facility', uid: f.uid })
                    : setSheet(getCard(f.defId))
                }
                onInfo={() => setSheet(getCard(f.defId))}
              />
            );
          })}
        </Zone>

        <Zone label="相手前衛">
          {renderSlots(foePlayer.units.length, state.rules.MAX_UNITS, (i) => {
            const u = foePlayer.units[i];
            return (
              <UnitChip
                key={u.uid}
                unit={u}
                state={state}
                mode={isTargetable({ kind: 'unit', uid: u.uid }) ? 'targetable' : 'idle'}
                hit={hitIds.has(u.uid)}
                onTap={() =>
                  isTargetable({ kind: 'unit', uid: u.uid })
                    ? tapTarget({ kind: 'unit', uid: u.uid })
                    : setSheet(getCard(u.defId))
                }
                onInfo={() => setSheet(getCard(u.defId))}
              />
            );
          })}
        </Zone>

        {/*
          常に高さを確保したまま可視/不可視だけを切り替える。
          条件付きマウントにすると、対象選択のたびに下の要素が
          ずれて「タップするたびにフィールドが動く」不便があったため。
        */}
        <button
          className={`base-target ${isTargetable({ kind: 'base', player: foe }) ? '' : 'inert'}`}
          onClick={() => tapTarget({ kind: 'base', player: foe })}
        >
          相手の拠点を対象にする
        </button>

        </div>

        <div className="divider" />

        <div className="board-me">
        <button
          className={`base-target ${isTargetable({ kind: 'base', player: me }) ? '' : 'inert'}`}
          onClick={() => tapTarget({ kind: 'base', player: me })}
        >
          自分の拠点を対象にする
        </button>

        <Zone label="自分前衛">
          {renderSlots(myPlayer.units.length, state.rules.MAX_UNITS, (i) => {
            const u = myPlayer.units[i];
            const targetable = isTargetable({ kind: 'unit', uid: u.uid });
            const selected = pending?.kind === 'attack' && pending.attackerUid === u.uid;
            return (
              <UnitChip
                key={u.uid}
                unit={u}
                state={state}
                mode={selected ? 'selected' : targetable ? 'targetable' : 'idle'}
                hit={hitIds.has(u.uid)}
                onTap={() => tapMyUnit(u.uid)}
                onInfo={() => setSheet(getCard(u.defId))}
              />
            );
          })}
        </Zone>

        <Zone label="自分施設">
          {renderSlots(myPlayer.facilities.length, state.rules.MAX_FACILITIES, (i) => {
            const f = myPlayer.facilities[i];
            const selected = pending?.kind === 'activate' && pending.facilityUid === f.uid;
            return (
              <FacilityChip
                key={f.uid}
                facility={f}
                mode={
                  selected
                    ? 'selected'
                    : isTargetable({ kind: 'facility', uid: f.uid })
                      ? 'targetable'
                      : 'idle'
                }
                hit={hitIds.has(f.uid)}
                onTap={() => tapMyFacility(f.uid)}
                onInfo={() => setSheet(getCard(f.defId))}
              />
            );
          })}
        </Zone>
        </div>
      </div>

      <StatusBar player={myPlayer} side="me" hit={hitIds.has(`base:${me}`)} />

      <div className="control-area">
        {battle.error && (
          <div className="prompt">
            <div className="notice">{battle.error}</div>
          </div>
        )}

        {/* --- オークション（仕様書 2.2） --- */}
        {state.phase === 'auction' && myPlayer.bid < 0 && (
          <AuctionPanel
            maxBid={state.rules.MAX_BID}
            baseHp={myPlayer.baseHp}
            value={bid}
            onChange={setBid}
            onSubmit={() => dispatch({ type: 'bid', player: me, amount: bid })}
          />
        )}
        {state.phase === 'auction' && myPlayer.bid >= 0 && (
          <div className="prompt">
            <div className="prompt-title">提示済み（{myPlayer.bid}）。相手の提示を待っています…</div>
          </div>
        )}

        {/* --- 分配フェイズ（仕様書 2.4-2） --- */}
        {state.phase === 'allocate' && isMyTurn && (
          <div className="prompt">
            <div className="prompt-title">
              フリーポイント{state.rules.FREE_POINTS}ptを分配してください
            </div>
            <div className="alloc-grid">
              {(['fund', 'mana', 'aether'] as const).map((kind) => (
                <AllocCell
                  key={kind}
                  label={RESOURCE_LABEL[kind]}
                  value={alloc[kind]}
                  canAdd={allocRemain > 0}
                  onAdd={() => setAlloc((a) => ({ ...a, [kind]: a[kind] + 1 }))}
                  onSub={() => setAlloc((a) => ({ ...a, [kind]: Math.max(0, a[kind] - 1) }))}
                  icon={<ResourceIcon kind={kind} size={11} />}
                />
              ))}
              <AllocCell
                label="ドロー"
                value={alloc.draw}
                canAdd={allocRemain > 0}
                onAdd={() => setAlloc((a) => ({ ...a, draw: a.draw + 1 }))}
                onSub={() => setAlloc((a) => ({ ...a, draw: Math.max(0, a.draw - 1) }))}
              />
            </div>
            <div className="alloc-remain">
              残り <strong>{allocRemain}</strong> pt
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={allocRemain !== 0}
              onClick={() => dispatch({ type: 'allocate', ...alloc })}
            >
              決定
            </button>
          </div>
        )}

        {/* --- 応答フェイズ（打ち消し） --- */}
        {state.phase === 'respond' && state.priority === me && <RespondPanel state={state} me={me} dispatch={dispatch} />}

        {/* --- 対象選択中 --- */}
        {pending && state.phase === 'main' && (
          <PendingPanel
            pending={pending}
            onCancel={cancelPending}
            onPickCost={(i) => {
              if (pending.kind !== 'playCard') return;
              setPending({ ...pending, costOption: i });
            }}
            onPickResource={(r) => {
              const next = { ...pending, resource: r } as NonNullable<Pending>;
              setPending(next);
              if (next.kind === 'playCard' && next.targets.length >= next.specs.length) commit(next);
              if (next.kind === 'activate') commit(next);
            }}
            myResources={myPlayer.resources}
          />
        )}

        {/* --- 捨て札（仕様書 2.1: ターン終了時に7枚へ） --- */}
        {state.phase === 'discard' && isMyTurn && (
          <div className="prompt">
            <div className="prompt-title">
              手札上限のため {discardNeed} 枚捨ててください（選択中 {discardPick.length}）
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={discardPick.length !== discardNeed}
              onClick={() => dispatch({ type: 'discard', uids: discardPick })}
            >
              捨てる
            </button>
          </div>
        )}

        <div className="hand-bar">
          <div className="hand-scroll">
            {myPlayer.hand.map((card) => (
              <HandCard
                key={card.uid}
                card={card}
                playable={playableUids.has(card.uid)}
                selected={
                  (pending?.kind === 'playCard' && pending.uid === card.uid) ||
                  discardPick.includes(card.uid)
                }
                onTap={() => tapHandCard(card.uid)}
                onInfo={() => setSheet(getCard(card.defId))}
              />
            ))}
            {myPlayer.hand.length === 0 && (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '8px 4px' }}>
                手札なし
              </div>
            )}
          </div>
          <button
            className="end-turn"
            disabled={state.phase !== 'main' || !isMyTurn}
            onClick={() => {
              setPending(null);
              dispatch({ type: 'endTurn' });
            }}
          >
            <Swords size={18} />
            ターン
            <br />
            終了
          </button>
        </div>
      </div>

      {sheet && <CardSheet def={sheet} onClose={() => setSheet(null)} />}
      {showLog && <LogPanel state={state} onClose={() => setShowLog(false)} />}
      {firstBanner && (
        <div className="first-banner" onClick={() => setFirstBanner(null)}>
          <div className="first-banner-card">
            <div className={`first-banner-title ${firstBanner.amIFirst ? 'you' : 'foe'}`}>
              {firstBanner.amIFirst ? 'あなたが先攻です' : '相手が先攻です'}
            </div>
            <div className="first-banner-sub">
              先攻: {firstBanner.firstName}（提示 {firstBanner.firstBid}）
              <br />
              後攻: {firstBanner.secondName}（提示 {firstBanner.secondBid}）
            </div>
          </div>
        </div>
      )}
      {state.winner !== null && (
        <div className="result">
          <div className={`verdict ${state.winner === me ? 'win' : 'lose'}`}>
            {state.winner === me ? 'WIN' : 'LOSE'}
          </div>
          <div className="reason">{state.winReason}</div>
          {/*
            「もう一度」が目立つ配色だと、ホームへ戻るつもりでうっかり押されて
            そのまま次の対局が始まってしまう（「ホームに戻らず次の試合が始まる」報告）。
            対局後の既定の導線はホームへ戻る方なので、そちらを主ボタンにする。
          */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={onExit}>
              ホームへ
            </button>
            <button className="btn" onClick={battle.restart}>
              もう一度
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 小さな部品
// ---------------------------------------------------------------------------

function sameRef(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'base' && b.kind === 'base') return a.player === b.player;
  if ((a.kind === 'unit' || a.kind === 'facility') && 'uid' in b) return a.uid === b.uid;
  return false;
}

function Zone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="zone">
      <div className="zone-label">{label}</div>
      <div className="zone-row">{children}</div>
    </div>
  );
}

/** 埋まっている枠を描き、残りは空きスロットで埋める */
function renderSlots(filled: number, max: number, render: (i: number) => React.ReactNode) {
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < filled; i++) nodes.push(render(i));
  for (let i = filled; i < max; i++) nodes.push(<div className="slot-empty" key={`empty${i}`} />);
  return nodes;
}

function StatusBar({
  player,
  side,
  hit,
}: {
  player: PlayerState;
  side: 'me' | 'foe';
  hit?: boolean;
}) {
  return (
    <div className={`status-bar ${side}`}>
      <span className="status-name">{player.name}</span>
      <span className={`hp ${hit ? 'hit-flash' : ''}`}>
        <Heart size={13} />
        {player.baseHp}
        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>/{player.maxBaseHp}</span>
      </span>
      <span className="res-row">
        {RESOURCE_KINDS.map((k) => (
          <span className={`res ${k}`} key={k}>
            <ResourceIcon kind={k} />
            {player.resources[k]}
          </span>
        ))}
      </span>
      <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>山{player.deck.length}</span>
    </div>
  );
}

function AllocCell({
  label,
  value,
  canAdd,
  onAdd,
  onSub,
  icon,
}: {
  label: string;
  value: number;
  canAdd: boolean;
  onAdd: () => void;
  onSub: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`alloc-cell ${value > 0 ? 'active' : ''}`}>
      <span className="ac-label">
        {icon} {label}
      </span>
      <span className="ac-value">{value}</span>
      <span className="alloc-steppers">
        <button onClick={onSub} disabled={value === 0} aria-label={`${label}を減らす`}>
          <Minus size={13} />
        </button>
        <button onClick={onAdd} disabled={!canAdd} aria-label={`${label}を増やす`}>
          <Plus size={13} />
        </button>
      </span>
    </div>
  );
}

/**
 * オークションパネル。
 * 仕様書 2.2 は「制限時間5秒の同時暗黙入力」だが、
 * 実機では考える間もなく即決を迫られ操作しづらいため時間無制限にしている。
 * 相手側（AI）は自分の提示を待たずに独自に決めるので、同時入力の性質自体は保たれる。
 */
function AuctionPanel({
  maxBid,
  baseHp,
  value,
  onChange,
  onSubmit,
}: {
  maxBid: number;
  baseHp: number;
  value: number;
  onChange: (v: number) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="auction">
      <div className="prompt-title" style={{ textAlign: 'center' }}>
        先攻権に支払う拠点HPを提示（同時入力）
      </div>
      <div className="auction-value">
        {value}
        <small> HP</small>
      </div>
      <div className="auction-hint">
        高い方が先攻。支払ったHPだけ減った状態で始まります
        <br />
        提示すると 拠点HP {baseHp - value} で開始
      </div>
      <input
        className="auction-slider"
        type="range"
        min={0}
        max={maxBid}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button className="btn btn-primary btn-block" onClick={onSubmit}>
        この額で提示する
      </button>
    </div>
  );
}

function RespondPanel({
  state,
  me,
  dispatch,
}: {
  state: GameState;
  me: PlayerId;
  dispatch: (a: import('../../core/types').GameAction) => boolean;
}) {
  const top = state.stack[state.stack.length - 1];
  const p = state.players[me];
  const counter = p.hand.find((c) => {
    const def = getCard(c.defId);
    return (
      def.keywords.includes('counter') &&
      p.resources.fund >= def.cost.fund &&
      p.resources.mana >= def.cost.mana &&
      p.resources.aether >= def.cost.aether
    );
  });

  return (
    <div className="prompt">
      <div className="prompt-title">
        相手が「{top ? getCard(top.defId).name : '?'}」を発動しました。打ち消しますか？
      </div>
      <div className="prompt-actions">
        <button className="btn" onClick={() => dispatch({ type: 'pass' })}>
          通す
        </button>
        <button
          className="btn btn-danger"
          disabled={!counter}
          onClick={() => counter && dispatch({ type: 'respond', uid: counter.uid })}
        >
          {counter ? getCard(counter.defId).name : '打ち消せない'}
        </button>
      </div>
    </div>
  );
}

function PendingPanel({
  pending,
  onCancel,
  onPickCost,
  onPickResource,
  myResources,
}: {
  pending: NonNullable<Pending>;
  onCancel: () => void;
  onPickCost: (costOption: number) => void;
  onPickResource: (r: ResourceKind) => void;
  myResources: import('../../core/types').Resources;
}) {
  let title = '';
  let needsCost = false;
  let needsResource = false;
  let excluded: ResourceKind | undefined;

  if (pending.kind === 'attack') {
    title = '攻撃対象を選んでください（もう一度タップでキャンセル）';
  } else if (pending.kind === 'playCard') {
    needsCost = pending.costOption === undefined;
    needsResource =
      !needsCost &&
      entryEffects(pending.def).some((e) => e.kind === 'gainResource') &&
      !pending.resource;
    excluded = needsCost ? undefined : paidResourceOf(costOptions(pending.def)[pending.costOption!]);
    title = needsCost
      ? `${pending.def.name}: 支払うリソースを選んでください`
      : needsResource
        ? `${pending.def.name}: 獲得するリソースを選んでください`
        : `${pending.def.name}: 対象を選んでください`;
  } else {
    const ability = pending.def.activated;
    needsResource = ability?.kind === 'convertResource' && !pending.resource;
    excluded = ability ? paidResourceOf(ability.cost) : undefined;
    title = needsResource
      ? `${pending.def.name}: 変換先のリソースを選んでください`
      : `${pending.def.name}: 対象を選んでください`;
  }

  return (
    <div className="prompt">
      <div className="prompt-title">{title}</div>
      {needsCost && pending.kind === 'playCard' ? (
        <div className="prompt-actions">
          {costOptions(pending.def).map((c, i) =>
            canPay(myResources, c) ? (
              <button key={i} className="btn" onClick={() => onPickCost(i)}>
                {formatCost(c)}
              </button>
            ) : null,
          )}
        </div>
      ) : needsResource ? (
        <div className="prompt-actions">
          {RESOURCE_KINDS.filter((r) => r !== excluded).map((r) => (
            <button key={r} className="btn" onClick={() => onPickResource(r)}>
              <ResourceIcon kind={r} size={14} />
              {RESOURCE_LABEL[r]}
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>({myResources[r]})</span>
            </button>
          ))}
        </div>
      ) : (
        <button className="btn btn-block" onClick={onCancel}>
          <X size={14} /> キャンセル
        </button>
      )}
    </div>
  );
}

function LogPanel({ state, onClose }: { state: GameState; onClose: () => void }) {
  return (
    <div className="log-panel">
      <div className="topbar">
        <h1>対局ログ</h1>
        <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="log-list">
        {state.log
          .slice()
          .reverse()
          .map((entry, i) => (
            <div key={i} className={entry.player === null ? '' : `p${entry.player}`}>
              <span style={{ opacity: 0.5 }}>T{entry.turn} </span>
              {entry.text}
            </div>
          ))}
      </div>
    </div>
  );
}
