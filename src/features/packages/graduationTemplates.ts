import type { PackageDraft, PackageSection } from './packageBuilder';

const filenames = ['Basic', 'Standard B', 'Standard A', 'Premium B', 'Premium A', 'Special'] as const;
export const graduationTemplates = filenames.map((tier, index) => {
  const name = tier.includes(' ') ? tier.replace(' ', ' Package ') : tier + ' Package';
  const mainSize = ['8R', '8R', '11R', '8R', '14×16', '14×16'][index];
  const frame = ['', '10×12 Classic', '13×16 Classic', '10×12 Premium', '13×16 Premium', '16×20 Premium'][index];
  const bonus = index >= 3 ? ['7×9 Classic', '10×12 Premium', '11×14 Premium'][index - 3] : '';
  const limit = [1, 0, 3, 3, 4, 0][index];
  const advertisedPrints = [15, 33, 36, 33, 36, 36][index];
  // Rows with unclear wardrobe/pose alternatives are preserved separately from included-print totals.
  const sections: PackageSection[] = [{
    id: 'inclusions', title: 'Photo session inclusions', type: 'inclusions',
    items: [{ name: 'Graduation toga without cap' }, ...(index > 0
      ? [{ name: 'Unlimited shots' }, { name: 'Graduation toga with cap and formal wardrobe as shown in the brochure' }] : [])],
  }, {
    id: 'prints', title: 'Frame and print breakdown', type: 'prints',
    prints: [
      { pose: 'Colored toga without cap', size: mainSize, quantity: 1 },
      { pose: 'Colored toga without cap', size: 'Wallet', quantity: 2 },
      { pose: 'Colored toga without cap', size: '2×2', quantity: 4 },
      { pose: 'Colored toga without cap', size: '1×1', quantity: 8 },
      ...(index === 0 ? [] : [
        { pose: 'Toga without cap, B&W background', size: 'Passport', quantity: 4 },
        { pose: 'Toga without cap, B&W background', size: '2×2', quantity: 4 },
        { pose: 'Toga without cap, B&W background', size: '1×1', quantity: 7 },
        { pose: 'Colored toga with cap', size: '5R', quantity: 1, alternative: 'Toga with cap' },
        { pose: 'Colored toga with cap', size: 'Wallet', quantity: 2, alternative: 'Toga with cap' },
        { pose: 'Filipiniana / coat and tie', size: '3R', quantity: 1, alternative: 'Formal wardrobe' },
        { pose: 'Filipiniana / coat and tie', size: 'Wallet', quantity: 2, alternative: 'Formal wardrobe' },
      ]),
      ...(index >= 4 ? [
        { pose: 'Glamour, preferred shot or Barong', size: '3R', quantity: 1, alternative: 'Additional wardrobe or style' },
        { pose: 'Glamour, preferred shot or Barong', size: 'Wallet', quantity: 2, alternative: 'Additional wardrobe or style' },
      ] : []),
    ],
  }];
  if (index > 0) sections.push({
    id: 'wardrobe', title: 'Wardrobe and photo styles', type: index === 3 ? 'options' : 'info',
    description: index === 3 ? 'Choose a preferred look. The studio can adjust this choice limit.' : 'Brochure offers Filipiniana, glamour where shown, coat and tie, and Barong. Confirm which alternatives apply before publishing.',
    ...(index === 3 ? { min: 1, max: 1, display: 'cards' as const, choices: [
      { id: 'filipiniana', name: 'Filipiniana', recommendation: 'female' as const },
      { id: 'glamour', name: 'Glamour Shot', recommendation: 'female' as const },
      { id: 'coat', name: 'Coat & Tie', recommendation: 'male' as const },
      { id: 'barong', name: 'Barong', recommendation: 'male' as const },
    ] } : {}),
  }, {
    id: 'freebies', title: 'Additional freebies', type: 'inclusions', freebies: true,
    items: ['Family picture', 'Barkada, couple and group shots', 'Use of toga, accessories and listed wardrobe',
      'Enhanced soft copies of chosen images', 'RAW copies of unedited images'].map((name) => ({ name })),
  });
  if (bonus) sections.push(index === 3 ? {
    id: 'bonus', title: 'Choose your bonus frame photo', type: 'options', min: 1, max: 1, display: 'list',
    description: `Choose a photo for your ${bonus} bonus frame.`,
    choices: ['Family', 'Barkada', 'Couple'].map((name) => ({ id: name.toLowerCase(), name })),
  } : {
    id: 'bonus', title: 'Extra free frame', type: 'info', description: `${bonus} bonus frame for a family, barkada or couple photo.`,
  });

  return {
    code: 'GRAD-' + ['BASIC', 'STD-B', 'STD-A', 'PREM-B', 'PREM-A', 'SPECIAL'][index],
    name, amount: [1395, 2595, 2895, 3950, 4750, 6950][index],
    description: 'Graduation photography package.', client_kind: 'school', revenue_category: 'studio',
    photo_selection_limit: limit, requires_mua: false, is_active: true,
    builder: {
      advertisedPrints, frame, sections,
      reviewNotes: [
        index > 0 ? `Brochure advertises ${advertisedPrints} prints. Confirm how the listed print rows and possible alternatives contribute to that total before publishing.` : '',
        index === 1 ? 'Verify the marked-up photo selection limit on the source brochure.' : '',
        index === 5 ? 'Frame discrepancy: the headline advertises 16×20 Premium, while the inclusions mention a 13×16 free frame. Confirm the actual entitlement and photo selection limit.' : '',
        index === 4 ? 'Verify the listed print size against the 13×16 frame and confirm the bonus-frame size on the source brochure.' : '',
      ].filter(Boolean).join('\n'),
    },
  } satisfies PackageDraft;
});
