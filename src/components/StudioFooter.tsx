export function StudioFooter() {
  return (
    <footer className="theme-night no-print group-has-[[data-student-overall]]/app-shell:hidden bg-obsidian text-neutral-400 py-6 mt-12 text-xs relative">
      <div aria-hidden="true" className="gold-rule absolute inset-x-0 top-0" />
      <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left font-mono">
        <div>
          <strong className="font-display font-semibold text-foil uppercase tracking-[0.18em]">Hi-Light Studio</strong> •
          P. del Rosario St., Cebu City (opp. USC-Main) • Tel: 032-2540886
        </div>
        <div className="text-neutral-400">
          STUDIOFLOW V2 // OFFLINE LAN AUTOMATION
        </div>
      </div>
    </footer>
  );
}
