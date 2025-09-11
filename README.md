# YMC Point of Sale System

Enterprise-grade Point of Sale solution built on modern web technologies, featuring real-time payment processing, automated inventory management, and scalable microservices architecture. Designed for high-volume retail operations with integrated financial and CRM systems.

**🚀 Now deployed on Heroku with automatic deployment from GitHub!**

## 🏗️ Architecture Overview

### 💳 Payment Processing Engine
- **Stripe Terminal SDK Integration** - Hardware abstraction layer for EMV-compliant card readers
- **Multi-tender Transaction Support** - Unified payment interface supporting card present/not present, cash, and promotional discounts
- **PCI DSS Compliant Processing** - End-to-end encryption with tokenization for sensitive cardholder data
- **Real-time Authorization** - Sub-second payment processing with comprehensive fraud detection

### 📊 Inventory Management System
- **RESTful API Integration** - Bidirectional synchronization with GoHighLevel CRM platform
- **Event-driven Stock Updates** - Real-time inventory adjustments using MongoDB change streams
- **Distributed Caching** - Optimized product catalog with Redis-like performance characteristics
- **Automated Reorder Logic** - Configurable low-stock thresholds with supplier integration

### 🎨 Frontend Architecture
- **Component-based UI Framework** - Modular React architecture with reusable business logic
- **Responsive Design System** - CSS Grid and Flexbox implementation with theme abstraction
- **State Management** - Centralized application state with optimistic UI updates
- **Progressive Web App** - Offline-capable with service worker implementation

## ⚙️ Technical Stack

### Client Layer
- **React 18** - Functional components with Hooks API and Concurrent Features
- **ES2022+ JavaScript** - Modern syntax with optional chaining and nullish coalescing
- **CSS3 Grid/Flexbox** - Responsive layout system with CSS custom properties
- **Stripe Terminal.js** - Hardware integration SDK for payment terminal management

### Server Layer
- **Node.js 18+ LTS** - Event-driven server runtime with ES modules support
- **Express.js 4.x** - Minimalist web framework with middleware architecture
- **MongoDB 6.x** - Document-oriented database with ACID transactions
- **Stripe API v2023** - Payment processing and terminal management APIs
- **GoHighLevel API** - Third-party CRM integration for inventory synchronization

### Infrastructure
- **RESTful API Design** - HTTP-based service architecture with JSON payload
- **JWT Authentication** - Stateless token-based security implementation
- **CORS Configuration** - Cross-origin resource sharing for multi-domain deployment
- **Environment-based Configuration** - Twelve-factor app methodology compliance

## 🚀 Installation & Deployment

### System Requirements
- **Runtime Environment**: Node.js ≥18.0.0 LTS
- **Database**: MongoDB ≥6.0 with replica set configuration
- **External Dependencies**: Stripe Account with Terminal API access
- **Optional**: GoHighLevel API credentials for inventory integration

### Local Development Setup

1. **Repository Initialization**
   ```bash
   git clone https://github.com/hira524/ymc-pos.git
   cd ymc-pos
   ```

2. **Backend Service Installation**
   ```bash
   cd backend
   npm ci --production=false
   ```

3. **Frontend Application Installation**
   ```bash
   cd ../frontend
   npm ci --production=false
   ```

### Environment Configuration

#### Backend Service Configuration
Create environment configuration file: `backend/.env`
```bash
# Stripe Payment Processing Configuration
STRIPE_SECRET_KEY=sk_live_[64_character_api_key]
STRIPE_PUBLISHABLE_KEY=pk_live_[64_character_public_key]

# Database Connection String
MONGODB_URI=mongodb+srv://[user]:[password]@[cluster].mongodb.net/[database]

# Third-party CRM Integration (Optional)
GHL_CLIENT_ID=[oauth_client_identifier]
GHL_CLIENT_SECRET=[oauth_client_secret]
GHL_LOCATION_ID=[location_uuid]
GHL_BASE_URL=https://services.leadconnectorhq.com

# Application Runtime Configuration
NODE_ENV=production
PORT=5000
CORS_ORIGIN=["http://localhost:3000","https://yourdomain.com"]
```

#### Frontend Application Configuration
Create environment configuration file: `frontend/.env`
```bash
# API Gateway Configuration
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_API_VERSION=v1

# Stripe Terminal Configuration
REACT_APP_STRIPE_LOCATION_ID=tml_[location_identifier]
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_[public_key]

# Application Build Configuration
REACT_APP_FORCE_TEST_MODE=false
GENERATE_SOURCEMAP=false
ESLINT_NO_DEV_ERRORS=true
```

### Service Orchestration

1. **Initialize Backend Service**
   ```bash
   cd backend
   npm run start
   # Service available at http://localhost:5000
   ```

2. **Initialize Frontend Application**
   ```bash
   cd frontend
   npm run start
   # Application available at http://localhost:3000
   ```

3. **Service Health Verification**
   ```bash
   # Backend API Health Check
   curl -X GET http://localhost:5000/test
   
   # Database Connection Verification
   curl -X GET http://localhost:5000/health
   ```

## 📱 Usage

### Setting Up Payment Terminal
1. Connect your BBPOS WisePad or compatible Stripe Terminal reader
2. Ensure the reader is powered on and connected to WiFi
3. The application will automatically discover and connect to available readers

### Processing Sales
1. **Add Products** - Select items from your inventory
2. **Apply Discounts** - Use percentage or fixed amount discounts
3. **Choose Payment Method** - Card (via terminal) or cash
4. **Process Payment** - Follow on-screen prompts for card payments
5. **Complete Transaction** - Print receipt or send digitally

### Inventory Management
- Products are automatically synced from GoHighLevel
- Stock levels update in real-time after each sale
- Monitor inventory through the dashboard

## 🏗️ Project Structure

```
ymc-pos/
├── backend/                    # Node.js/Express API server
│   ├── server.js              # Main server file
│   ├── .env                   # Environment configuration
│   ├── package.json           # Backend dependencies
│   └── stripe-account-diagnostic.js  # Stripe testing utility
├── frontend/                  # React.js client application
│   ├── src/
│   │   ├── App.js            # Main application component
│   │   ├── themes.css        # Theme system styling
│   │   ├── pos.css           # POS-specific styles
│   │   └── components.css    # UI component styles
│   ├── public/               # Static assets
│   ├── .env                  # Frontend environment variables
│   └── package.json          # Frontend dependencies
├── .gitignore                # Git ignore patterns
└── README.md                 # This file
```

## 🔧 Development

### Testing Stripe Integration
Run the diagnostic tool to verify your Stripe configuration:
```bash
cd backend
node stripe-account-diagnostic.js
```

### Available Scripts

#### Backend
- `npm start` - Start the production server
- `npm run dev` - Start development server with nodemon

#### Frontend
- `npm start` - Start development server
- `npm run build` - Create production build
- `npm test` - Run test suite

## 🌐 Deployment

### Production Deployment

#### Backend (Render/Heroku)
1. Set environment variables in your hosting platform
2. Deploy the `backend` directory
3. Ensure MongoDB Atlas is configured for external connections

#### Frontend (Netlify/Vercel)
1. Update `REACT_APP_BACKEND_URL` to your production backend URL
2. Deploy the `frontend` directory
3. Configure build settings: `npm run build`

### Environment Setup
- Configure production Stripe keys (live mode)
- Set up SSL certificates for secure connections
- Configure CORS for your frontend domain

## 🔐 Security Features

- **API Key Encryption** - Secure storage of sensitive credentials
- **Payment Security** - PCI-compliant transaction processing via Stripe
- **Environment Isolation** - Separate test and production configurations
- **Error Sanitization** - Safe error messages without sensitive data exposure

## 🆘 Troubleshooting

### Common Issues

**Payment Terminal Not Connecting**
- Ensure reader is powered on and connected to WiFi
- Verify Stripe Terminal location ID is correct
- Check that live Stripe keys are properly configured

**Backend Connection Failed**
- Verify backend server is running on correct port
- Check environment variables are loaded correctly
- Ensure MongoDB connection string is valid

**Inventory Not Syncing**
- Verify GoHighLevel API credentials
- Check internet connectivity
- Review API rate limits

### Getting Help
- Check the browser console for detailed error messages
- Run the Stripe diagnostic tool for payment issues
- Verify all environment variables are correctly set

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🆘 Support

For support, create an issue in this repository or contact the development team.

---

**Enterprise Point of Sale • Built for Scale • Engineered for Performance**

### 🏷️ Tags
`pos-system` `react` `nodejs` `stripe-terminal` `mongodb` `gohighlevel` `payment-processing` `inventory-management` `retail` `point-of-sale` `ecommerce`
