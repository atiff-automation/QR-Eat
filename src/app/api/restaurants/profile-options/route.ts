/**
 * Restaurant Profile Options API
 * Returns predefined options for restaurant profile fields
 */

import { NextResponse } from 'next/server';

// GET - Fetch all profile options for restaurant setup
export async function GET() {
  try {
    const profileOptions = {
      businessTypes: [
        { value: 'restaurant', label: 'Restaurant', icon: '🍽️' },
        { value: 'cafe', label: 'Café', icon: '☕' },
        { value: 'bar', label: 'Bar', icon: '🍹' },
        { value: 'food_truck', label: 'Food Truck', icon: '🚚' },
        { value: 'bakery', label: 'Bakery', icon: '🥖' },
        { value: 'pizzeria', label: 'Pizzeria', icon: '🍕' },
        { value: 'fast_food', label: 'Fast Food', icon: '🍔' },
        { value: 'fine_dining', label: 'Fine Dining', icon: '🥂' },
        { value: 'casual_dining', label: 'Casual Dining', icon: '🍴' }
      ],

      cuisineTypes: [
        { value: 'american', label: 'American', icon: '🇺🇸' },
        { value: 'italian', label: 'Italian', icon: '🇮🇹' },
        { value: 'mexican', label: 'Mexican', icon: '🇲🇽' },
        { value: 'chinese', label: 'Chinese', icon: '🇨🇳' },
        { value: 'japanese', label: 'Japanese', icon: '🇯🇵' },
        { value: 'indian', label: 'Indian', icon: '🇮🇳' },
        { value: 'french', label: 'French', icon: '🇫🇷' },
        { value: 'thai', label: 'Thai', icon: '🇹🇭' },
        { value: 'greek', label: 'Greek', icon: '🇬🇷' },
        { value: 'mediterranean', label: 'Mediterranean', icon: '🫒' },
        { value: 'korean', label: 'Korean', icon: '🇰🇷' },
        { value: 'vietnamese', label: 'Vietnamese', icon: '🇻🇳' },
        { value: 'spanish', label: 'Spanish', icon: '🇪🇸' },
        { value: 'middle_eastern', label: 'Middle Eastern', icon: '🥙' },
        { value: 'seafood', label: 'Seafood', icon: '🦞' },
        { value: 'steakhouse', label: 'Steakhouse', icon: '🥩' },
        { value: 'vegetarian', label: 'Vegetarian', icon: '🥗' },
        { value: 'vegan', label: 'Vegan', icon: '🌱' },
        { value: 'bbq', label: 'BBQ', icon: '🍖' },
        { value: 'sushi', label: 'Sushi', icon: '🍣' },
        { value: 'pizza', label: 'Pizza', icon: '🍕' },
        { value: 'burger', label: 'Burger', icon: '🍔' },
        { value: 'sandwich', label: 'Sandwich', icon: '🥪' },
        { value: 'breakfast', label: 'Breakfast', icon: '🥞' },
        { value: 'brunch', label: 'Brunch', icon: '🥐' },
        { value: 'dessert', label: 'Dessert', icon: '🍰' }
      ],

      priceRanges: [
        { value: '$', label: '$ - Inexpensive', description: 'Under $15 per person' },
        { value: '$$', label: '$$ - Moderate', description: '$15 - $30 per person' },
        { value: '$$$', label: '$$$ - Expensive', description: '$30 - $60 per person' },
        { value: '$$$$', label: '$$$$ - Very Expensive', description: 'Over $60 per person' }
      ],

      features: [
        { value: 'parking', label: 'Parking Available', icon: '🅿️' },
        { value: 'wifi', label: 'Free WiFi', icon: '📶' },
        { value: 'outdoor_seating', label: 'Outdoor Seating', icon: '🌞' },
        { value: 'pet_friendly', label: 'Pet Friendly', icon: '🐕' },
        { value: 'wheelchair_accessible', label: 'Wheelchair Accessible', icon: '♿' },
        { value: 'kids_friendly', label: 'Kids Friendly', icon: '👶' },
        { value: 'live_music', label: 'Live Music', icon: '🎵' },
        { value: 'private_dining', label: 'Private Dining', icon: '🍽️' },
        { value: 'catering', label: 'Catering Services', icon: '🎂' },
        { value: 'bar', label: 'Full Bar', icon: '🍻' },
        { value: 'wine_bar', label: 'Wine Bar', icon: '🍷' },
        { value: 'happy_hour', label: 'Happy Hour', icon: '🍹' },
        { value: 'late_night', label: 'Late Night Dining', icon: '🌙' },
        { value: 'breakfast', label: 'Breakfast Served', icon: '🥞' },
        { value: 'brunch', label: 'Brunch Available', icon: '🥐' },
        { value: 'tv_screens', label: 'TV Screens', icon: '📺' },
        { value: 'sports_bar', label: 'Sports Bar', icon: '⚽' },
        { value: 'romantic', label: 'Romantic Atmosphere', icon: '💕' },
        { value: 'business_dining', label: 'Business Dining', icon: '💼' },
        { value: 'group_dining', label: 'Group Dining', icon: '👥' },
        { value: 'valet_parking', label: 'Valet Parking', icon: '🚗' },
        { value: 'air_conditioning', label: 'Air Conditioning', icon: '❄️' },
        { value: 'heating', label: 'Heating', icon: '🔥' },
        { value: 'smoking_area', label: 'Smoking Area', icon: '🚭' }
      ],

      timezones: [
        { value: 'America/New_York', label: 'Eastern Time (ET)' },
        { value: 'America/Chicago', label: 'Central Time (CT)' },
        { value: 'America/Denver', label: 'Mountain Time (MT)' },
        { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
        { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
        { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
        { value: 'UTC', label: 'UTC' },
        { value: 'Europe/London', label: 'London (GMT)' },
        { value: 'Europe/Paris', label: 'Paris (CET)' },
        { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
        { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
        { value: 'Australia/Sydney', label: 'Sydney (AEST)' }
      ],

      currencies: [
        { value: 'USD', label: 'US Dollar ($)', symbol: '$' },
        { value: 'EUR', label: 'Euro (€)', symbol: '€' },
        { value: 'GBP', label: 'British Pound (£)', symbol: '£' },
        { value: 'CAD', label: 'Canadian Dollar (C$)', symbol: 'C$' },
        { value: 'AUD', label: 'Australian Dollar (A$)', symbol: 'A$' },
        { value: 'JPY', label: 'Japanese Yen (¥)', symbol: '¥' },
        { value: 'CNY', label: 'Chinese Yuan (¥)', symbol: '¥' },
        { value: 'INR', label: 'Indian Rupee (₹)', symbol: '₹' },
        { value: 'MXN', label: 'Mexican Peso ($)', symbol: '$' },
        { value: 'BRL', label: 'Brazilian Real (R$)', symbol: 'R$' }
      ],

      socialMediaPlatforms: [
        { value: 'facebook', label: 'Facebook', icon: '📘', placeholder: 'https://facebook.com/yourrestaurant' },
        { value: 'instagram', label: 'Instagram', icon: '📷', placeholder: 'https://instagram.com/yourrestaurant' },
        { value: 'twitter', label: 'Twitter', icon: '🐦', placeholder: 'https://twitter.com/yourrestaurant' },
        { value: 'tiktok', label: 'TikTok', icon: '🎵', placeholder: 'https://tiktok.com/@yourrestaurant' },
        { value: 'yelp', label: 'Yelp', icon: '⭐', placeholder: 'https://yelp.com/biz/yourrestaurant' },
        { value: 'google', label: 'Google My Business', icon: '🔍', placeholder: 'https://maps.google.com/...' },
        { value: 'tripadvisor', label: 'TripAdvisor', icon: '🦉', placeholder: 'https://tripadvisor.com/...' },
        { value: 'linkedin', label: 'LinkedIn', icon: '💼', placeholder: 'https://linkedin.com/company/yourrestaurant' }
      ],

      defaultOperatingHours: {
        monday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
        tuesday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
        wednesday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
        thursday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
        friday: { isOpen: true, openTime: '09:00', closeTime: '23:00' },
        saturday: { isOpen: true, openTime: '10:00', closeTime: '23:00' },
        sunday: { isOpen: true, openTime: '10:00', closeTime: '21:00' }
      },

      templates: {
        descriptions: [
          {
            name: 'Casual Restaurant',
            content: 'Welcome to our warm and inviting restaurant where fresh, locally-sourced ingredients meet classic recipes. Our friendly atmosphere makes it the perfect place for family dinners, casual dates, or catching up with friends.'
          },
          {
            name: 'Fine Dining',
            content: 'Experience culinary excellence in our sophisticated dining establishment. Our award-winning chef creates innovative dishes using the finest seasonal ingredients, paired with an extensive wine selection in an elegant atmosphere.'
          },
          {
            name: 'Family Restaurant',
            content: 'A family-owned restaurant serving hearty, home-style meals in a comfortable setting. We pride ourselves on generous portions, friendly service, and creating a welcoming environment for guests of all ages.'
          },
          {
            name: 'Cafe',
            content: 'Your neighborhood cafe offering freshly roasted coffee, artisanal pastries, and light meals. Whether you\'re grabbing your morning coffee or settling in with a laptop, we provide a cozy atmosphere for work and relaxation.'
          }
        ]
      }
    };

    return NextResponse.json({
      success: true,
      options: profileOptions
    });

  } catch (error) {
    console.error('Error fetching profile options:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}