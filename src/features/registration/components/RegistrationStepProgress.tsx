import { useLayoutEffect, useRef, useState } from 'react';

const steps = [
  { label: 'Client', headingId: 'sec-client-info' },
  { label: 'Contact', headingId: 'sec-contact' },
  { label: 'Package', headingId: 'sec-packages' },
  { label: 'Sign', headingId: 'sec-signature' },
];

export function RegistrationStepProgress() {
  const stripRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const fill = fillRef.current;
    const page = strip?.parentElement;

    const navbar = document.querySelector<HTMLElement>('header[role="banner"]');
    const headings = steps.map(({ headingId }) => document.getElementById(headingId));
    if (!strip || !fill || !page || !headings.every((heading) => heading !== null)) return;

    const lastStep = headings.length - 1;
    let currentStep = 0;
    let currentProgress = 0;
    let readingLine = 0;
    let frame: number | undefined;

    const updateProgress = () => {
      frame = undefined;
      const scrollTop = window.scrollY;
      let nextStep = 0;
      let progress = 0;

      if (scrollTop > 0) {
        const scrollLimit = document.documentElement.scrollHeight - window.innerHeight;
        const stops = headings.map((heading) => Math.round(heading.getBoundingClientRect().top + scrollTop - readingLine));
        stops[lastStep] = Math.min(stops[lastStep], scrollLimit);

        // Keep room for each segment even when a tall viewport cannot scroll
        // every heading up to the reading line.
        const minimumSegment = Math.min(48, stops[lastStep] / lastStep);
        for (let index = lastStep - 1; index >= 0; index--) {
          stops[index] = Math.max(0, Math.min(stops[index], stops[index + 1] - minimumSegment));
        }

        nextStep = Math.max(0, stops.findLastIndex((stop) => scrollTop >= stop));
        const segment = nextStep < lastStep
          ? Math.max(0, scrollTop - stops[nextStep]) / (stops[nextStep + 1] - stops[nextStep])
          : 0;
        progress = (nextStep + segment) / lastStep;
      }

      // Drive the fill from scroll frames while keeping React updates at step boundaries.
      if (progress !== currentProgress) {
        fill.style.transform = `scaleX(${progress})`;
        currentProgress = progress;
      }

      if (nextStep !== currentStep) {
        currentStep = nextStep;
        setActiveStep(nextStep);
      }
    };

    function scheduleUpdate() {
      frame ??= requestAnimationFrame(updateProgress);
    }

    const measureOffsets = () => {
      const navbarHeight = navbar?.offsetHeight ?? 0;
      const contentOffset = navbarHeight + strip.offsetHeight + 10;
      page.style.setProperty('--registration-navbar-height', `${navbarHeight}px`);
      page.style.setProperty('--registration-scroll-offset', `${contentOffset}px`);
      readingLine = contentOffset + 24;
    };

    measureOffsets();
    updateProgress();

    const observer = new ResizeObserver(() => {
      measureOffsets();
      scheduleUpdate();
    });
    observer.observe(strip);
    observer.observe(page);
    if (navbar) observer.observe(navbar);

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      page.style.removeProperty('--registration-navbar-height');
      page.style.removeProperty('--registration-scroll-offset');
    };
  }, []);

  return (
    <div
      ref={stripRef}
      className="sticky top-(--registration-navbar-height) z-30 mb-8 border-2 border-t-0 border-[#0A0A0A] bg-[#0A0A0A] px-6 pb-4 sm:px-8 shadow-[6px_6px_0px_#C9A227]"
    >
      <div className="relative border-t border-neutral-800 pt-3">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12.5%] top-[22px] h-px bg-neutral-700">
          <div
            ref={fillRef}
            className="h-full origin-left bg-[#C9A227] [transform:scaleX(0)]"
          />
        </div>
        <ol aria-label="Registration steps" className="relative grid grid-cols-4 font-mono text-[10px] font-bold uppercase tracking-wider">
          {steps.map(({ label, headingId }, index) => (
            <li
              key={headingId}
              aria-current={index === activeStep ? 'step' : undefined}
              className={`flex flex-col items-center gap-1 whitespace-nowrap motion-safe:transition-colors motion-safe:duration-300 ${
                index <= activeStep ? 'text-[#C9A227]' : 'text-neutral-400'
              }`}
            >
              <span className={`grid h-5 w-7 place-items-center border font-black motion-safe:transition-colors motion-safe:duration-300 ${
                index <= activeStep
                  ? 'border-[#C9A227] bg-[#C9A227] text-[#0A0A0A]'
                  : 'border-neutral-700 bg-[#0A0A0A] text-neutral-400'
              }`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
