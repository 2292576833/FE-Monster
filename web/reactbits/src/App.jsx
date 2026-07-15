import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Disc3,
  Heart,
  ListMusic,
  LogIn,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  User,
  Volume2,
  VolumeX,
  WandSparkles
} from 'lucide-react';
import ElectricBorder from '../components/ElectricBorder.jsx';
import GlassSurface from '../components/GlassSurface.jsx';
import LineWaves from '../components/LineWaves.jsx';
import './styles.css';

const topNav = ['Discover', 'Playlists', 'Lyrics', 'Visuals'];

const playlists = [
  {
    id: 'blue-hour',
    title: 'Blue Hour Radio',
    count: '64 songs',
    mood: 'Current shelf',
    cover: 'linear-gradient(135deg, #dfeeff, #75d8ff 38%, #264b80 100%)',
    active: true
  },
  {
    id: 'night-drive',
    title: 'Night Drive',
    count: '42 songs',
    mood: 'Bass focused',
    cover: 'linear-gradient(135deg, #ffefd0, #ff9b72 38%, #151923 100%)'
  },
  {
    id: 'glass-vocals',
    title: 'Glass Vocals',
    count: '31 songs',
    mood: 'Lyric preset',
    cover: 'linear-gradient(135deg, #f3fbff, #9fbcff 44%, #1a2338 100%)'
  }
];

const queue = [
  { title: 'Let the Sound Cross', artist: 'FE Visual Lab', time: '03:48', current: true },
  { title: 'Particle Shelf', artist: 'Black Glass Set', time: '04:12' },
  { title: 'Blue Pulse Room', artist: 'Night Current', time: '03:36' },
  { title: 'Orbiting Lines', artist: 'Glass Stage', time: '05:04' }
];

const presets = [
  { id: 'calm', name: 'Calm', value: 36 },
  { id: 'pulse', name: 'Pulse', value: 72, active: true },
  { id: 'orbit', name: 'Orbit', value: 58 }
];

function GlassPanel({ children, className = '', height = 'auto', radius = 20, strong = false, tone = 'clear' }) {
  return (
    <GlassSurface
      className={`fe-glass-panel ${strong ? 'is-strong' : ''} ${className}`.trim()}
      tone={tone}
      width="100%"
      height={height}
      borderRadius={radius}
      borderWidth={0.075}
      brightness={strong ? 54 : 48}
      opacity={0.94}
      blur={12}
      displace={0.42}
      backgroundOpacity={strong ? 0.12 : 0.08}
      saturation={1.14}
      distortionScale={-175}
      redOffset={-6}
      greenOffset={8}
      blueOffset={20}
    >
      {children}
    </GlassSurface>
  );
}

function GlassButton({
  children,
  className = '',
  icon: Icon,
  label,
  active = false,
  iconOnly = false,
  round = false,
  primary = false,
  disabled = false,
  onClick
}) {
  const content = (
    <GlassSurface
      className={`glass-control ${active ? 'is-active' : ''} ${primary ? 'is-primary' : ''} ${
        round ? 'is-round' : ''
      } ${className}`.trim()}
      width={round ? 46 : 'auto'}
      height={round ? 46 : 42}
      borderRadius={round ? 999 : 15}
      borderWidth={0.08}
      brightness={active || primary ? 56 : 48}
      opacity={0.94}
      blur={10}
      displace={0.38}
      backgroundOpacity={active || primary ? 0.16 : 0.08}
      saturation={1.16}
      distortionScale={-165}
      redOffset={-4}
      greenOffset={8}
      blueOffset={18}
    >
      <button
        type="button"
        className="glass-button-native"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2.2} /> : null}
        {iconOnly ? <span className="sr-only">{label}</span> : <span>{children ?? label}</span>}
      </button>
    </GlassSurface>
  );

  if (!primary) return content;

  return (
    <ElectricBorder color="#8be5ff" speed={0.72} chaos={0.05} borderRadius={round ? 999 : 16}>
      {content}
    </ElectricBorder>
  );
}

function TopBar() {
  return (
    <GlassPanel className="top-bar" height={78} radius={24} strong>
      <div className="brand-lockup">
        <span className="brand-mark"><Disc3 size={20} aria-hidden="true" /> FE</span>
        <div>
          <strong>FE Monster</strong>
          <small>local music client</small>
        </div>
      </div>

      <nav className="top-nav" aria-label="Primary">
        {topNav.map((item) => (
          <GlassButton key={item} label={item} active={item === 'Playlists'}>
            {item}
          </GlassButton>
        ))}
      </nav>

      <GlassPanel className="search-box" height={46} radius={18} tone="black">
        <Search size={17} aria-hidden="true" />
        <span>Search songs, playlists, lyrics</span>
      </GlassPanel>

      <div className="top-actions">
        <GlassButton icon={WandSparkles} label="DIY" />
        <GlassButton icon={LogIn} label="Login" />
        <GlassButton icon={User} label="User avatar" iconOnly round className="avatar-frame" />
      </div>
    </GlassPanel>
  );
}

function PlaylistCard({ playlist }) {
  const body = (
    <GlassPanel className={`playlist-card ${playlist.active ? 'is-selected' : ''}`} height={126} radius={18}>
      <button type="button" className="playlist-card-button">
        <span className="cover-art" style={{ background: playlist.cover }}>
          <Music2 size={20} aria-hidden="true" />
        </span>
        <span className="playlist-copy">
          <strong>{playlist.title}</strong>
          <small>{playlist.count}</small>
          <em>{playlist.mood}</em>
        </span>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </GlassPanel>
  );

  if (!playlist.active) return body;

  return (
    <ElectricBorder color="#80ddff" speed={0.68} chaos={0.06} borderRadius={18}>
      {body}
    </ElectricBorder>
  );
}

function LibraryPanel() {
  return (
    <aside className="library-panel">
      <GlassPanel className="account-card" height={184} radius={22} strong>
        <div className="account-top">
          <span className="account-avatar">M</span>
          <div>
            <strong>Logged in listener</strong>
            <small>Netease playlist mirror ready</small>
          </div>
        </div>
        <div className="account-stats" aria-label="Library stats">
          <span><strong>137</strong><small>Songs</small></span>
          <span><strong>12</strong><small>Lists</small></span>
          <span><strong>04</strong><small>Presets</small></span>
        </div>
      </GlassPanel>

      <div className="playlist-stack" aria-label="User playlists">
        {playlists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} />
        ))}
      </div>
    </aside>
  );
}

function VisualStage({ isPlaying }) {
  return (
    <section className="visual-stage" aria-label="Playback visual stage">
      <div className="stage-waves" aria-hidden="true">
        <LineWaves
          speed={isPlaying ? 0.22 : 0.08}
          innerLineCount={24}
          outerLineCount={42}
          warpIntensity={isPlaying ? 0.78 : 0.42}
          rotation={-24}
          brightness={isPlaying ? 0.34 : 0.18}
          color1="#74d9ff"
          color2="#f4fbff"
          color3="#ffad8b"
          mouseInfluence={0.6}
        />
      </div>

      <div className={`stage-orb ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <GlassPanel className="lyric-glass" height={202} radius={28} strong>
        <span className="lyric-label">3D lyric preset</span>
        <strong>let the sound cross the glass stage</strong>
        <p>highlight follows the beat, color follows the song mood</p>
      </GlassPanel>
    </section>
  );
}

function QueuePanel() {
  return (
    <aside className="queue-panel">
      <GlassPanel className="preset-panel" height={190} radius={22} strong>
        <div className="panel-head">
          <div>
            <strong>Visual preset</strong>
            <small>Glass pulse</small>
          </div>
          <GlassButton icon={SlidersHorizontal} label="Adjust visual preset" iconOnly round />
        </div>
        <div className="preset-list">
          {presets.map((preset) => (
            <button key={preset.id} type="button" className={preset.active ? 'preset-row is-active' : 'preset-row'}>
              <span>{preset.name}</span>
              <i><b style={{ width: `${preset.value}%` }} /></i>
            </button>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="queue-card" height="100%" radius={22}>
        <div className="panel-head">
          <div>
            <strong>Playing queue</strong>
            <small>4 tracks</small>
          </div>
          <GlassButton icon={MoreHorizontal} label="More queue actions" iconOnly round />
        </div>
        <div className="queue-list">
          {queue.map((item) => (
            <button key={item.title} type="button" className={item.current ? 'queue-row is-current' : 'queue-row'}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.artist}</small>
              </span>
              <em>{item.time}</em>
            </button>
          ))}
        </div>
      </GlassPanel>
    </aside>
  );
}

function PlayerDock() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(42);
  const [volume, setVolume] = useState(76);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setProgress((value) => (value >= 99.5 ? 0 : Math.min(100, value + 0.36)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  return (
    <GlassPanel className="player-dock" height={104} radius={28} strong tone="black">
      <div className="track-mini-cover" aria-hidden="true" />

      <div className="track-meta">
        <strong>Let the Sound Cross</strong>
        <small>FE Visual Lab</small>
      </div>

      <div className="transport-controls" aria-label="Playback controls">
        <GlassButton icon={Shuffle} label="Shuffle" iconOnly round />
        <GlassButton icon={SkipBack} label="Previous song" iconOnly round />
        <GlassButton
          icon={isPlaying ? Pause : Play}
          label={isPlaying ? 'Pause' : 'Play'}
          iconOnly
          round
          primary
          className="play-toggle"
          onClick={() => setIsPlaying((value) => !value)}
        />
        <GlassButton icon={SkipForward} label="Next song" iconOnly round />
        <GlassButton icon={Repeat2} label="Repeat" iconOnly round />
      </div>

      <div className="progress-zone">
        <input
          aria-label="Music progress"
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(event) => setProgress(Number(event.target.value))}
          style={{ '--range-value': `${progress}%` }}
        />
        <div className="time-row">
          <span>01:54</span>
          <span>04:31</span>
        </div>
      </div>

      <div className="volume-zone">
        <GlassButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? 'Turn music on' : 'Turn music off'}
          iconOnly
          round
          onClick={() => setMuted((value) => !value)}
        />
        <input
          aria-label="Volume"
          type="range"
          min="0"
          max="100"
          value={muted ? 0 : volume}
          onChange={(event) => {
            setMuted(false);
            setVolume(Number(event.target.value));
          }}
          style={{ '--range-value': `${muted ? 0 : volume}%` }}
        />
      </div>

      <GlassButton icon={ListMusic} label="Queue" />
    </GlassPanel>
  );
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(true);
  const stage = useMemo(() => <VisualStage isPlaying={isPlaying} />, [isPlaying]);

  useEffect(() => {
    const timer = window.setInterval(() => setIsPlaying((value) => value), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="fe-local-client">
      <div className="ambient-lines" aria-hidden="true">
        <LineWaves
          speed={0.12}
          innerLineCount={18}
          outerLineCount={34}
          warpIntensity={0.54}
          rotation={-16}
          brightness={0.12}
          color1="#77d7ff"
          color2="#f8fbff"
          color3="#ff9d79"
          enableMouseInteraction={false}
        />
      </div>

      <TopBar />

      <section className="client-layout">
        <LibraryPanel />
        {stage}
        <QueuePanel />
      </section>

      <PlayerDock />
    </main>
  );
}
