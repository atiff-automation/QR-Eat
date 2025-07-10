# QR Restaurant Ordering System

A modern QR code-based restaurant ordering system built with Next.js, TypeScript, and PostgreSQL.

## Features

- **QR Code Ordering**: Customers scan table QR codes to access menu and place orders
- **Real-time Updates**: Live order status updates for customers and staff
- **Staff Dashboard**: Order management and approval workflow
- **Kitchen Display**: Real-time kitchen order queue and status tracking
- **Payment Integration**: Secure payment processing with Stripe
- **Mobile-First Design**: Responsive design optimized for mobile devices

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- React Hook Form
- Zustand (state management)

### Backend
- Node.js 18+
- Prisma ORM
- PostgreSQL 15+
- Redis 7+
- Socket.io (real-time)

### Development Tools
- ESLint + Prettier
- Husky (git hooks)
- Jest (testing)
- Playwright (E2E testing)

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   
3. **Set up database**
   ```bash
   npm run db:setup
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking

## Project Structure

```
src/
├── app/                 # Next.js app router
│   ├── api/            # API routes
│   └── (pages)/        # Page components
├── components/         # Reusable components
│   ├── ui/            # UI components
│   ├── forms/         # Form components
│   └── layout/        # Layout components
├── lib/               # Utility libraries
│   ├── auth/          # Authentication
│   ├── database/      # Database utilities
│   └── utils/         # Helper functions
└── types/             # TypeScript type definitions
```

## Development Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

3. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Contributing

Please read our contributing guidelines and follow the established patterns.

## License

MIT License - see LICENSE file for details.