import { Link } from 'react-router-dom';
import PageContainer from '@/components/layout/PageContainer';

interface Section {
  heading: string;
  body: string[];
}

function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: Section[] }) {
  return (
    <PageContainer className="max-w-3xl">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="text-xs text-zinc-500">Last updated: {updated}</p>
      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.heading} className="rounded-2xl bg-ink-900 p-5 ring-1 ring-white/5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-400">
              {s.heading}
            </h2>
            {s.body.map((p, i) => (
              <p key={i} className="mb-2 text-sm leading-relaxed text-zinc-400 last:mb-0">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="text-xs text-zinc-600">
        Questions? <Link to="/settings" className="text-accent-400 hover:underline">Contact via Settings</Link> or
        email <span className="text-zinc-400">kitacontact@protonmail.com</span>.
      </p>
    </PageContainer>
  );
}

const UPDATED = 'September 15, 2026';
const DOMAIN = 'kitawatch.nx.kg';

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      sections={[
        {
          heading: 'The service',
          body: [
            `KitaWatch (${DOMAIN}) is a desktop application and companion website that acts as a client for third-party sources. KitaWatch does not host, store, upload, or distribute any video content on its servers.`,
            'All anime metadata (titles, descriptions, artwork) is provided by the AniList API. All streaming sources are resolved from independent third-party providers at playback time, on your own device.',
          ],
        },
        {
          heading: 'Acceptable use',
          body: [
            'You may use KitaWatch for personal, non-commercial viewing only.',
            'You are responsible for compliance with the laws of your country regarding accessing content via third-party sources. KitaWatch makes no representation that the content accessible through it is legal to view in your jurisdiction.',
          ],
        },
        {
          heading: 'No warranty',
          body: [
            'The software is provided "as is", without warranty of any kind. Sources may be unreliable, unavailable, or incorrect at any time. See the in-app disclaimer: we do not control and are not responsible for any third-party content.',
          ],
        },
        {
          heading: 'Accounts',
          body: [
            'Optional AniList login stores your access token locally on your device only. You may disconnect at any time in Settings.',
          ],
        },
        {
          heading: 'Changes',
          body: [
            'We may update these terms as the project evolves. Continued use after changes constitutes acceptance.',
          ],
        },
      ]}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      sections={[
        {
          heading: 'Data we store',
          body: [
            'Everything is stored locally on your device: your settings, watch history, My List, and (optionally) your AniList access token. Clearing app data in Settings removes all of it.',
            'KitaWatch operates no servers of its own and collects no analytics, telemetry, crash reports, or usage statistics.',
          ],
        },
        {
          heading: 'Third-party services',
          body: [
            'AniList (anilist.co): metadata queries, and authenticated requests if you log in. Subject to the AniList privacy policy.',
            'Streaming providers: when you play an episode, your device contacts the resolved provider and its CDNs directly. Their privacy policies apply to those requests.',
            'AniKage (anikage.cc): used as one of several optional stream sources when you play content.',
          ],
        },
        {
          heading: 'Cookies & tracking',
          body: [
            'The application uses no cookies and includes no trackers. Local storage is used only for your preferences and library.',
          ],
        },
        {
          heading: 'Your rights',
          body: [
            `Because we hold no server-side data about you, there is nothing to export or delete on our side — everything lives on your device. Questions: kitacontact@protonmail.com.`,
          ],
        },
      ]}
    />
  );
}

export function DmcaPage() {
  return (
    <LegalPage
      title="DMCA & Copyright"
      updated={UPDATED}
      sections={[
        {
          heading: 'We do not host content',
          body: [
            'KitaWatch contains no copyrighted video files and operates no storage or distribution infrastructure. The application resolves publicly available third-party sources at runtime, entirely on the user\'s device.',
          ],
        },
        {
          heading: 'Notices',
          body: [
            'If you are a rights holder and believe a source surfaced by KitaWatch infringes your copyright, contact the source site directly — they control the content.',
            'You may also reach us at contact@kitawatch.nx.kg and we will review whether the source in question should be removed from the app\'s resolver list.',
          ],
        },
        {
          heading: 'Repeat policy',
          body: [
            'Sources identified as infringing in valid notices are removed from the default resolver configuration in subsequent releases.',
          ],
        },
      ]}
    />
  );
}
