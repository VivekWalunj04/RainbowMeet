import { MessageSquare, MonitorUp, ShieldCheck, Users } from 'lucide-react';

import RoomJoinScreen from '../components/RoomJoinScreen';

const FEATURES = [
  { icon: Users, title: 'Rooms for 4–5', text: 'SFU-powered, so everyone stays crisp even on weak Wi-Fi.' },
  { icon: MonitorUp, title: 'Screen share', text: 'Present a tab, window, or your whole screen.' },
  { icon: MessageSquare, title: 'Live chat', text: 'Real-time messages that persist for the session.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Short-lived room tokens minted server-side.' },
];

/** Landing page — create or join a room. */
export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-4 py-12">
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 30rem at 20% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(50rem 25rem at 90% 110%, rgba(16,185,129,0.12), transparent 60%)',
        }}
      />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-lg text-center lg:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
            Meetings that
            <span className="text-accent-hover"> just work</span>.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Start a room, share the link, and you're talking in seconds.
            No accounts, no installs — just your browser.
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="rounded-xl border border-zinc-800/80 bg-surface-800/60 p-4 text-left backdrop-blur"
              >
                <Icon className="mb-2 h-5 w-5 text-accent-hover" />
                <p className="text-sm font-semibold text-zinc-100">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{text}</p>
              </li>
            ))}
          </ul>
        </div>

        <RoomJoinScreen />
      </div>

      <p className="relative z-10 mt-10 text-xs text-zinc-600">
        Built with LiveKit SFU · React · Socket.IO
      </p>
    </div>
  );
}
