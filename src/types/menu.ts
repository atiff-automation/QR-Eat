export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  menuItems: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  costPrice?: number;
  imageUrl?: string;
  preparationTime: number;
  calories?: number;
  allergens: string[];
  dietaryInfo: string[];
  isAvailable: boolean;
  isFeatured: boolean;
  displayOrder: number;
  variations: MenuItemVariation[];
}

export interface MenuItemVariation {
  id: string;
  name: string;
  priceModifier: number;
  variationType: string;
  isRequired: boolean;
  maxSelections: number;
  displayOrder: number;
}

export interface CartItem {
  menuItemId: string;
  menuItem: MenuItem;
  quantity: number;
  selectedVariations: Array<{
    variationId: string;
    variation: MenuItemVariation;
    quantity: number;
  }>;
  specialInstructions?: string;
  unitPrice: number;
  totalPrice: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
}

export interface Table {
  id: string;
  tableNumber: string;
  tableName?: string;
  capacity: number;
  status: string;
  locationDescription?: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    address: string;
    phone?: string;
    currency: string;
    taxRate: number;
    serviceChargeRate: number;
  };
}
