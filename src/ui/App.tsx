/**
 * 画面遷移のルート。
 * ルータは使わず、状態1つで画面を切り替える（縦画面の単純な階層のため）。
 */
import { useEffect, useState } from 'react';
import { HomeScreen, type Screen } from './screens/HomeScreen';
import { SoloSetupScreen } from './screens/SoloSetupScreen';
import { BattleScreen } from './screens/BattleScreen';
import { DeckScreen } from './screens/DeckScreen';
import { RoomScreen } from './screens/RoomScreen';
import { TutorialScreen } from './screens/TutorialScreen';
import { loadSlots, saveSlots, type DeckSlot } from './deckStorage';
import { getPreset } from '../cards/decks';
import type { BattleConfig } from './useBattle';
import './theme.css';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [slots, setSlots] = useState<DeckSlot[]>(() => loadSlots());
  const [battleConfig, setBattleConfig] = useState<BattleConfig | null>(null);

  useEffect(() => saveSlots(slots), [slots]);

  if (screen === 'battle' && battleConfig) {
    return (
      <div className="app">
        <BattleScreen config={battleConfig} onExit={() => setScreen('home')} />
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'home' && <HomeScreen onNavigate={setScreen} />}

      {screen === 'solo' && (
        <SoloSetupScreen
          slots={slots}
          onBack={() => setScreen('home')}
          onStart={({ myDeck, myName, foeDeckId, difficulty }) => {
            const foe = getPreset(foeDeckId);
            setBattleConfig({
              myDeck,
              myName,
              foeDeck: foe.cards,
              foeName: foe.name,
              difficulty,
              // 対局ごとに違う卓になるよう時刻からシードを作る
              seed: (Date.now() ^ 0x2545f491) | 0,
              mySide: 0,
            });
            setScreen('battle');
          }}
        />
      )}

      {screen === 'deck' && (
        <DeckScreen slots={slots} onChange={setSlots} onBack={() => setScreen('home')} />
      )}

      {screen === 'room' && <RoomScreen onBack={() => setScreen('home')} />}
      {screen === 'tutorial' && <TutorialScreen onBack={() => setScreen('home')} />}
    </div>
  );
}
