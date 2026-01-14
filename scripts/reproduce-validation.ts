import { ValidationSchemas, validateApiInput } from '../src/lib/validation';

const cases = [
  {
    name: 'Happy Path',
    data: {
      name: 'Test Variation',
      priceModifier: 1.5,
      variationType: 'Size',
      isRequired: false,
      maxSelections: 1,
      displayOrder: 0,
    },
  },
  {
    name: 'String Price',
    data: {
      name: 'Test Variation',
      priceModifier: '1.50',
      variationType: 'Size',
      isRequired: false,
      maxSelections: 1,
      displayOrder: 0,
    },
  },
  {
    name: 'String MaxSelections',
    data: {
      name: 'Test Variation',
      priceModifier: 1.5,
      variationType: 'Size',
      isRequired: false,
      maxSelections: '1',
      displayOrder: 0,
    },
  },
  {
    name: 'Missing Type',
    data: {
      name: 'Test Variation',
      priceModifier: 1.5,
      // variationType missing
      isRequired: false,
      maxSelections: 1,
      displayOrder: 0,
    },
  },
  {
    name: 'Zero MaxSelections (min: 1)',
    data: {
      name: 'Test Variation',
      priceModifier: 1.5,
      variationType: 'Size',
      isRequired: false,
      maxSelections: 0,
      displayOrder: 0,
    },
  },
];

cases.forEach((c) => {
  console.log(`\nTesting: ${c.name}`);
  const result = validateApiInput(c.data, ValidationSchemas.menuItemVariation);
  if (!result.isValid) {
    console.error('FAIL:', result.errors);
  } else {
    console.log('PASS');
  }
});
