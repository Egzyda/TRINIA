/**
 * チュートリアル画面（仕様書 3.1）
 * 基本ルールをテキストで案内する。数値はRULESから引くので調整が自動で反映される。
 */
import { ChevronLeft, Coins, Gauge, Gavel, Hand, Layers, Swords, Timer } from 'lucide-react';
import { MATCH_MODES, RULES } from '../../core/rules';

export function TutorialScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <ChevronLeft size={18} />
        </button>
        <h1>チュートリアル</h1>
      </div>

      <div className="screen-scroll">
        <div className="tutorial">
          <section>
            <h3>
              <Swords size={16} color="#5aa9ff" /> 勝利条件
            </h3>
            <p>
              相手の拠点HPを0にすれば勝ちです（拠点HPは対局モードで変わります）。
              カウントダウン兵器を維持しきる特殊勝利もあります。
            </p>
          </section>

          <section>
            <h3>
              <Gavel size={16} color="#e8b53a" /> オークションで先攻を決める
            </h3>
            <p>
              対局開始時、両者が「先攻権に支払う拠点HP」を同時に提示します
              （上限は対局モードごとに変わります）。
            </p>
            <ul>
              <li>高く提示した側が先攻。提示した分だけHPが減った状態で始まります</li>
              <li>低い側は後攻。拠点HPは満タンのままです</li>
              <li>同点ならランダムで先後を決め、後攻側が初期リソース+{RULES.SECOND_PLAYER_BONUS}ptを得ます</li>
            </ul>
            <p>先攻の価値は自分のデッキ次第。速攻デッキほど高く積む価値があります。</p>
          </section>

          <section>
            <h3>
              <Coins size={16} color="#3fbf7f" /> 3つのリソースと2ptの分配
            </h3>
            <p>
              資金・魔力・エーテルの3種があり、すべて0から始まります。
              毎ターン開始時にフリーポイントが無条件で与えられ、
              「リソースへのチャージ」か「追加ドロー（{RULES.DRAW_COST}ptで1枚）」に自由に振り分けます。
            </p>
            <p>未使用のリソースは上限なく次のターンへ持ち越せます。</p>
          </section>

          <section>
            <h3>
              <Timer size={16} color="#b07be0" /> 1ターンの流れ
            </h3>
            <ul>
              <li>ドロー: 山札から1枚引く</li>
              <li>分配: フリーポイントを振り分ける</li>
              <li>メイン: カードのプレイ・攻撃・施設の起動を順不同で何度でも</li>
              <li>エンド: 手札が{RULES.HAND_LIMIT}枚を超えていたら捨てる</li>
            </ul>
          </section>

          <section>
            <h3>
              <Hand size={16} color="#ff5f6d" /> 戦闘のルール
            </h3>
            <ul>
              <li>召喚酔いはありません。出したユニットはそのターンから攻撃できます</li>
              <li>前衛は最大{RULES.MAX_UNITS}体、施設は最大{RULES.MAX_FACILITIES}枠</li>
              <li>敵前衛がいる間は拠点を直接殴れず、前衛同士の戦闘になります（相互にダメージ）</li>
              <li>【すり抜け】は前衛を無視して拠点・施設を攻撃できます</li>
              <li>【挑発】がいる場合はそれを優先して攻撃しなければなりません</li>
              <li>敵前衛がいなければ、拠点か施設を選んで攻撃できます</li>
            </ul>
          </section>

          <section>
            <h3>
              <Layers size={16} color="#e8b53a" /> デッキ
            </h3>
            <p>
              デッキは{RULES.DECK_SIZE}枚、同名カードは{RULES.MAX_COPIES}枚まで。
              初期手札は{RULES.INITIAL_HAND}枚で引き直しはありません。
              山札が尽きたら墓地をシャッフルして再生成するので、デッキ切れによる敗北はありません。
            </p>
          </section>

          <section>
            <h3>
              <Gauge size={16} color="#5aa9ff" /> 対局モード
            </h3>
            <p>対局を始める前に、試合の長さを選べます。</p>
            <ul>
              {MATCH_MODES.map((m) => (
                <li key={m.id}>
                  <strong style={{ color: 'var(--text)' }}>{m.name}</strong>: 拠点HP{' '}
                  {m.overrides.BASE_HP} / 毎ターン {m.overrides.FREE_POINTS}pt / {m.turnsHint}
                </li>
              ))}
            </ul>
            <p>
              クイックは拠点HPが低いぶん、毎ターンもらえるポイントが増えます。
              重いカードにも手が届くので、短いだけの試合にはなりません。
            </p>
          </section>

          <section>
            <h3>操作のコツ</h3>
            <ul>
              <li>カード右上の i マークをタップするとカードの詳細が開きます</li>
              <li>自分のユニットをタップ → 攻撃対象をタップ、で攻撃します</li>
              <li>選択をやめたいときは、同じものをもう一度タップします</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
