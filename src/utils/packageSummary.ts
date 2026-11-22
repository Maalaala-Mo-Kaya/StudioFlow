// What a package offers, read from its rendered inclusions (pb_hooks/studio_catalog.js render) for
// the kiosk's flyer-style card and popup: the frame, the hard copy count, the shots, the poses shot
// without prints, and the print poses ("Colored toga w/out cap" › 1 pc - 8R, 2 pcs - wallet).
// Packages written as text before the builder still read: what isn't recognised stays as sections
// or plain lines.
import type { InclusionSection, Package, PackageInclusion, PackageOptionGroup } from '../types';
import { isSection, parseInclusionTree } from './inclusions';
import { optionGroups } from './packageOptions';
import { parsePackageInclusions } from './formatters';

export interface PackageSummary {
  /** "10x12 premium frame", from "With 10x12 premium frame". */
  frame: string;
  /** From "N pcs hard printout copy" (the server adds the prints up). */
  prints: number;
  /** The line under the price: the admin's tagline, or "with <frame>". */
  tagline: string;
  /** "Unlimited shots (choose your best 3)", or ''. */
  shots: string;
  /** How many photos the client picks (0: not limited / not offered). */
  pick: number;
  /** Poses and items without prints: Toga w/out cap, Filipiniana… */
  poses: string[];
  /** Print poses with their sizes. */
  printPoses: InclusionSection[];
  /** Prints listed on their own (not in a pose). */
  loosePrints: string[];
  /** Other titled sections (older packages written as text). */
  sections: InclusionSection[];
  freebies: string[];
  options: PackageOptionGroup[];
}

const FRAME_AND_PRINTS = /^frame\s*(?:and|&)\s*prints?$/i;
const PRINT_COUNT = /^(\d+)\s*pcs?\.?\s+hard\s*print/i;
const SHOTS = /^unlimited\s+shots?/i;

export function packageSummary(pkg: Pick<Package, 'inclusions' | 'freebies' | 'option_groups' | 'photo_selection_limit' | 'tagline'>): PackageSummary {
  const out: PackageSummary = {
    frame: '', prints: 0, tagline: '', shots: '', pick: Math.max(0, pkg.photo_selection_limit || 0),
    poses: [], printPoses: [], loosePrints: [], sections: [],
    freebies: parsePackageInclusions(pkg.freebies), options: optionGroups(pkg),
  };
  const take = (entry: PackageInclusion) => {
    if (isSection(entry)) out.sections.push(entry);
    else if (SHOTS.test(entry)) out.shots = entry;
    else out.poses.push(entry);
  };
  for (const entry of parseInclusionTree(pkg.inclusions)) {
    if (!isSection(entry) || !FRAME_AND_PRINTS.test(entry.title.trim())) { take(entry); continue; }
    for (const child of entry.items) {
      if (isSection(child)) { out.printPoses.push(child); continue; }
      const count = PRINT_COUNT.exec(child.trim());
      if (count) out.prints = Number(count[1]);
      else if (!out.frame && /\bframe\b/i.test(child)) out.frame = child.trim().replace(/^with\s+/i, '');
      else out.loosePrints.push(child);
    }
  }
  out.tagline = pkg.tagline?.trim() || (out.frame ? `with ${out.frame}` : '');
  return out;
}

/**
 * What each client gets for an exchange: "Girls: Filipiniana / Glamour shots · Boys: Coat and tie
 * or Barong", or "Filipiniana / Glamour shots" when everyone has the same choices.
 */
export function exchangeNote(group: PackageOptionGroup): string {
  const forGender = (gender: 'female' | 'male') => {
    const keep = !group.replaces_for || group.replaces_for === 'all' || group.replaces_for === gender;
    const labels = group.choices.filter((c) => c.for === 'all' || c.for === gender).map((c) => c.label);
    return [...(keep && group.replaces ? [group.replaces] : []), ...labels].join(' / ');
  };
  const girls = forGender('female');
  const boys = forGender('male');
  if (girls === boys) return girls;
  return [girls && `Girls: ${girls}`, boys && `Boys: ${boys}`].filter(Boolean).join(' · ');
}
