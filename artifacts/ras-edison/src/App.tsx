import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDashed,
  Command,
  Compass,
  Layers3,
  Lightbulb,
  MoveRight,
  Sparkles,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [idea, setIdea] = useState('');
  const [activeShelf, setActiveShelf] = useState('translate');
  const [isShaping, setIsShaping] = useState(false);
  const [shapedIdea, setShapedIdea] = useState('');
  const ideaRef = useRef<HTMLTextAreaElement>(null);

  const shelfItems = [
    {
      id: 'translate',
      number: '01',
      title: 'Translate',
      description: 'Turn a loose thought into a clear brief.',
      prompt: 'A simpler way to plan a weekend with friends',
      icon: Lightbulb,
    },
    {
      id: 'sequence',
      number: '02',
      title: 'Sequence',
      description: 'Find the smallest useful next step.',
      prompt: 'A smoother first-run experience for a finance app',
      icon: Compass,
    },
    {
      id: 'shape',
      number: '03',
      title: 'Shape',
      description: 'Give the idea edges people can use.',
      prompt: 'A quiet dashboard for tracking creative projects',
      icon: Layers3,
    },
  ];

  const activeItem =
    shelfItems.find((item) => item.id === activeShelf) ?? shelfItems[0];

  const handleShape = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const source = idea.trim() || activeItem.prompt;
    setIdea(source);
    setIsShaping(true);
    window.setTimeout(() => {
      setShapedIdea(
        `A focused ${activeItem.title.toLowerCase()} pass: start with “${source}”, define the person it serves, then name the smallest moment that should feel easier.`
      );
      setIsShaping(false);
    }, 620);
  };

  const focusComposer = () => {
    document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth' });
    window.setTimeout(() => ideaRef.current?.focus(), 420);
  };

  const showMethod = () => {
    document.getElementById('method')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="grain min-h-[100dvh] overflow-hidden bg-[#f2ecdc] text-[#1b2b27]">
      <div className="workspace-grid relative isolate">
        <div className="pointer-events-none absolute -right-24 top-20 -z-10 h-72 w-72 rounded-full bg-[#e9b949]/25 blur-3xl" />
        <div className="pointer-events-none absolute left-[38%] top-[32%] -z-10 h-48 w-48 rounded-full bg-[#d56c50]/10 blur-3xl" />

        <header className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="focus-ring group flex items-center gap-3 rounded-lg text-left"
            data-testid="button-home-logo"
            aria-label="Return to the top of RAS-Edison"
          >
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#1b2b27] text-[#f4c64e] shadow-[4px_4px_0_#d56c50] transition-transform duration-200 group-hover:-translate-y-0.5">
              <span className="display-font text-lg font-bold tracking-[-0.08em]">R/</span>
            </span>
            <span>
              <span className="display-font block text-[1.05rem] font-bold tracking-[-0.04em]" data-testid="text-brand-name">
                RAS-Edison
              </span>
              <span className="mono-font block text-[9px] uppercase tracking-[0.2em] text-[#1b2b27]/55" data-testid="text-brand-category">
                idea workspace
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3">
            <span className="mono-font hidden items-center gap-2 rounded-full border border-[#1b2b27]/15 bg-[#f7f1e5]/70 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#1b2b27]/60 sm:flex" data-testid="status-workspace">
              <CircleDashed className="h-3 w-3 text-[#d56c50]" />
              Workspace / 01
            </span>
            <button
              type="button"
              onClick={focusComposer}
              className="focus-ring group inline-flex items-center gap-2 rounded-full bg-[#1b2b27] px-4 py-2.5 text-sm font-semibold text-[#f7f1e5] transition-colors hover:bg-[#29423a]"
              data-testid="button-open-workspace"
            >
              Open workspace
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>
        </header>

        <section className="mx-auto grid max-w-[1440px] items-end gap-16 px-6 pb-20 pt-16 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)] lg:px-16 lg:pb-28 lg:pt-24">
          <div className="max-w-[760px]">
            <div className="rise-in mb-7 flex items-center gap-3">
              <span className="mono-font text-[10px] font-bold uppercase tracking-[0.24em] text-[#d56c50]" data-testid="text-kicker">
                A place to begin
              </span>
              <span className="h-px w-16 bg-[#d56c50]/50" />
              <Sparkles className="h-4 w-4 text-[#d56c50]" />
            </div>
            <h1 className="display-font rise-in delay-1 max-w-[760px] text-[clamp(3.7rem,8.2vw,8.5rem)] font-semibold leading-[0.87] tracking-[-0.075em] text-[#1b2b27]" data-testid="heading-home">
              Make the
              <br />
              <span className="relative inline-block text-[#d56c50]">
                next thing
                <span className="absolute -bottom-2 left-1 h-3 w-[96%] -rotate-1 bg-[#e9b949]" />
              </span>
              <br />
              <span className="text-[#1b2b27]">clear.</span>
            </h1>
            <p className="rise-in delay-2 mt-9 max-w-[500px] text-lg leading-8 text-[#1b2b27]/68 sm:text-xl" data-testid="text-home-description">
              RAS-Edison is a focused workspace for turning good instincts into software people can actually use.
            </p>
            <div className="rise-in delay-3 mt-9 flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={focusComposer}
                className="focus-ring interactive-lift group inline-flex items-center gap-3 rounded-xl bg-[#e9b949] px-5 py-3.5 text-sm font-bold text-[#1b2b27] shadow-[4px_4px_0_#1b2b27]"
                data-testid="button-start-idea"
              >
                Start with an idea
                <MoveRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={showMethod}
                className="focus-ring group inline-flex items-center gap-2 rounded-lg px-1 py-3 text-sm font-semibold text-[#1b2b27]/70 hover:text-[#1b2b27]"
                data-testid="button-see-method"
              >
                See the method
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          <div id="composer" className="rise-in delay-2 relative">
            <div className="absolute -left-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-[#1b2b27]/15 bg-[#f7f1e5] text-[#1b2b27] shadow-[2px_2px_0_#d56c50]" aria-hidden="true">
              <Command className="h-4 w-4" />
            </div>
            <form
              onSubmit={handleShape}
              className="relative overflow-hidden rounded-2xl border border-[#1b2b27]/15 bg-[#1b2b27] p-5 text-[#f7f1e5] shadow-[10px_12px_0_rgba(27,43,39,.14)] sm:p-7"
              data-testid="form-idea-composer"
            >
              <div className="mb-10 flex items-start justify-between gap-4">
                <div>
                  <p className="mono-font text-[10px] uppercase tracking-[0.2em] text-[#f4c64e]" data-testid="text-composer-label">
                    The Edison pass
                  </p>
                  <h2 className="display-font mt-3 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl" data-testid="heading-composer">
                    Start rough.
                    <br />
                    Leave with a shape.
                  </h2>
                </div>
                <span className="mono-font text-[10px] text-[#f7f1e5]/40">01 / 03</span>
              </div>
              <label className="sr-only" htmlFor="idea-input">Your starting idea</label>
              <textarea
                ref={ideaRef}
                id="idea-input"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="What are you thinking about?"
                rows={3}
                className="focus-ring w-full resize-none rounded-xl border border-[#f7f1e5]/20 bg-[#f7f1e5]/[.07] px-4 py-4 text-base leading-7 text-[#f7f1e5] placeholder:text-[#f7f1e5]/40 focus:border-[#f4c64e] focus:outline-none"
                data-testid="input-idea"
              />
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="mono-font text-[10px] uppercase tracking-[0.12em] text-[#f7f1e5]/40" data-testid="text-composer-hint">
                  No wrong doors here
                </span>
                <button
                  type="submit"
                  disabled={isShaping}
                  className="focus-ring group inline-flex items-center gap-2 rounded-lg bg-[#f4c64e] px-4 py-2.5 text-sm font-bold text-[#1b2b27] transition-all hover:bg-[#f7d66e] disabled:cursor-wait disabled:opacity-70"
                  data-testid="button-shape-idea"
                >
                  {isShaping ? 'Finding the edge' : 'Shape this'}
                  {isShaping ? <CircleDashed className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
                </button>
              </div>
              {shapedIdea && (
                <div className="mt-6 border-t border-[#f7f1e5]/15 pt-5" data-testid="status-shaped-idea">
                  <div className="mb-2 flex items-center gap-2 text-[#f4c64e]">
                    <Check className="h-4 w-4" />
                    <span className="mono-font text-[10px] uppercase tracking-[0.16em]">A useful first shape</span>
                  </div>
                  <p className="text-sm leading-6 text-[#f7f1e5]/72">{shapedIdea}</p>
                </div>
              )}
              <div className="pointer-events-none absolute -bottom-16 -right-10 h-48 w-48 rounded-full border border-[#f4c64e]/20" />
              <div className="pointer-events-none absolute -bottom-9 -right-3 h-28 w-28 rounded-full border border-[#f4c64e]/20" />
            </form>
          </div>
        </section>
      </div>

      <section className="border-y border-[#1b2b27]/12 bg-[#e8dfcb]/55" id="method">
        <div className="mx-auto grid max-w-[1440px] gap-8 px-6 py-12 sm:px-10 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-16 lg:py-16">
          <div>
            <p className="mono-font text-[10px] uppercase tracking-[0.2em] text-[#d56c50]" data-testid="text-method-kicker">How it works</p>
            <h2 className="display-font mt-3 max-w-[420px] text-3xl font-semibold leading-tight tracking-[-0.055em] sm:text-4xl" data-testid="heading-method">
              Less blank page.
              <br />
              More useful momentum.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {shelfItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeShelf;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveShelf(item.id);
                    setIdea(item.prompt);
                    focusComposer();
                  }}
                  className={`focus-ring interactive-lift group relative min-h-[178px] rounded-xl border p-5 text-left transition-colors ${isActive ? 'border-[#1b2b27] bg-[#1b2b27] text-[#f7f1e5]' : 'border-[#1b2b27]/15 bg-[#f7f1e5]/60 text-[#1b2b27] hover:bg-[#f7f1e5]'}`}
                  data-testid={`button-method-${item.id}`}
                  aria-pressed={isActive}
                >
                  <div className="flex items-start justify-between">
                    <Icon className={`h-5 w-5 ${isActive ? 'text-[#f4c64e]' : 'text-[#d56c50]'}`} />
                    <span className={`mono-font text-[10px] ${isActive ? 'text-[#f7f1e5]/45' : 'text-[#1b2b27]/40'}`}>{item.number}</span>
                  </div>
                  <div className="mt-12">
                    <h3 className="display-font text-xl font-semibold tracking-[-0.04em]" data-testid={`text-method-title-${item.id}`}>{item.title}</h3>
                    <p className={`mt-1 text-xs leading-5 ${isActive ? 'text-[#f7f1e5]/60' : 'text-[#1b2b27]/55'}`}>{item.description}</p>
                  </div>
                  <ArrowUpRight className={`absolute bottom-5 right-5 h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${isActive ? 'text-[#f4c64e]' : 'text-[#1b2b27]/35'}`} />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1440px] flex-col gap-5 px-6 py-8 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-16" data-testid="footer-home">
        <p className="display-font text-lg font-semibold tracking-[-0.04em]" data-testid="text-footer-note">
          Built for the first good question.
        </p>
        <div className="flex items-center gap-5">
          <span className="mono-font text-[10px] uppercase tracking-[0.17em] text-[#1b2b27]/45" data-testid="text-footer-version">RAS / 0.1</span>
          <span className="h-1.5 w-1.5 rounded-full bg-[#d56c50]" aria-hidden="true" />
          <span className="mono-font text-[10px] uppercase tracking-[0.17em] text-[#1b2b27]/45" data-testid="text-footer-status">Ready when you are</span>
        </div>
      </footer>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
