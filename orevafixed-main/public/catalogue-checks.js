export function catalogueWarnings(product) {
  const warnings=[];
  if(product.category==='Bags' && /\b(shoes?|heels?|loafers?|sandals?|slippers?)\b/i.test(product.name))warnings.push('Check category: this looks like footwear but is listed under Bags.');
  if(product.variants.some(v=>v.price<100000))warnings.push('Check price: at least one option is below ₦1,000.');
  if(product.category==='Shoes'&&product.variants.some(v=>!v.size||/\d\s*[-–]\s*\d/.test(v.size)))warnings.push('Add each available shoe size as its own option with its actual stock.');
  if(product.variants.some(v=>/\b(?:and|or)\b|,/.test(v.colour)))warnings.push('Check colours: separate selectable colours into individual stock options.');
  return warnings;
}
