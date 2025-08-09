# YMC POS - Inventory Management & Training Guide

## 📚 Table of Contents
1. [Walk-in Passes & Pricing](#walk-in-passes--pricing)
2. [Inventory Management](#inventory-management)
3. [Stock Monitoring & Alerts](#stock-monitoring--alerts)
4. [Discount System](#discount-system)
5. [Phone Number Conflict Resolution](#phone-number-conflict-resolution)
6. [Cash Payment Calculator](#cash-payment-calculator)
7. [GHL Integration](#ghl-integration)
8. [Troubleshooting](#troubleshooting)

---

## 🎫 Walk-in Passes & Pricing

### Available Pass Types

#### Full Price Passes
- **Adult Walk-in Pass**: $15.00
- **Child Walk-in Pass**: $10.00
- **Senior Walk-in Pass**: $12.00
- **Student Walk-in Pass**: $12.00
- **Family Pass (2 Adults + 2 Kids)**: $45.00

#### Half Price Passes
- **Adult Walk-in Pass (Half Price)**: $7.50
- **Child Walk-in Pass (Half Price)**: $5.00
- **Senior Walk-in Pass (Half Price)**: $6.00
- **Student Walk-in Pass (Half Price)**: $6.00
- **Family Pass (Half Price)**: $22.50

#### Staff Discount Passes (10% off)
- **Adult Walk-in Pass (Staff)**: $13.50
- **Child Walk-in Pass (Staff)**: $9.00
- **Senior Walk-in Pass (Staff)**: $10.80
- **Student Walk-in Pass (Staff)**: $10.80
- **Family Pass (Staff)**: $40.50

#### Day Passes
- **Adult Day Pass**: $25.00
- **Child Day Pass**: $15.00
- **Senior/Student Day Pass**: $20.00

#### Special Event Passes
- **Adult Special Event**: $20.00
- **Child Special Event**: $12.00
- **Family Special Event Package**: $55.00

### Adding New Pass Types
To add new walk-in passes to the inventory:

1. Edit `add-ghl-inventory.js`
2. Add new items to the `items` array:
```javascript
{ name: 'New Pass Type', price: 15.00, quantity: 100 }
```
3. Run the script: `node add-ghl-inventory.js`

---

## 📦 Inventory Management

### How Inventory Tracking Works

1. **GHL Integration**: All products are stored in GoHighLevel (GHL) system
2. **Real-time Updates**: When items are sold, inventory automatically decreases
3. **Automatic Alerts**: Email notifications sent when stock reaches 20 units
4. **Centralized Management**: All inventory changes sync across all systems

### Checking Current Stock

1. **In POS System**: Stock levels visible on each product card
2. **In GHL Dashboard**: 
   - Go to Products section
   - View each product's "Available Quantity"
3. **API Endpoint**: `GET /inventory` returns all current stock levels

### Updating Stock Levels

#### Method 1: Through GHL Dashboard
1. Log into GHL account
2. Navigate to Products section
3. Select the product to update
4. Modify "Available Quantity"
5. Save changes

#### Method 2: Bulk Updates via Script
1. Modify `ghl-items.json` with new quantities
2. Use update script (if available)
3. Verify changes in POS system

### Stock Movement Tracking

Every sale automatically:
- ✅ Decreases inventory by sold quantity
- ✅ Logs transaction in MongoDB
- ✅ Checks for low stock conditions
- ✅ Sends alerts if needed

---

## 🚨 Stock Monitoring & Alerts

### Automatic Low Stock Alerts

**Alert Threshold**: 20 units
**Alert Method**: Email notification
**Alert Recipients**: Configured in environment variables

### Email Alert Content
When stock reaches 20 units or below, staff receive:
- 📧 **Subject**: "🚨 Low Stock Alert - [Product Name]"
- 📊 **Current Stock Count**
- ⚠️ **Threshold Information**
- 📝 **Action Items**:
  - Check supplier availability
  - Place restock order
  - Update inventory in GHL
  - Monitor sales to prevent stockout

### Setting Up Email Alerts

Add these environment variables to your `.env` file:
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ALERT_EMAIL=manager@ymcommunity.com
```

### Monitoring Best Practices

1. **Daily Stock Check**: Review low stock alerts each morning
2. **Weekly Inventory Review**: Check all product levels weekly
3. **Reorder Points**: Set up supplier relationships for quick restocking
4. **Seasonal Adjustments**: Increase stock for high-demand periods

---

## 💰 Discount System

### 10% Staff/Senior Discount

#### How to Apply
1. Add items to cart normally
2. Click "🎯 10% Staff/Senior Discount" button
3. Discount automatically applied to entire cart
4. Complete payment as usual

#### Features
- ✅ **Visual Confirmation**: Shows original price, discount amount, and new total
- ✅ **One-Click Application**: Single button applies to entire cart
- ✅ **Easy Removal**: "❌ Remove" button to cancel discount
- ✅ **Automatic Calculation**: Works with any cart total
- ✅ **Payment Integration**: Discount preserved through payment process

#### Training Points
- **Who Qualifies**: Staff members and seniors (65+)
- **ID Verification**: Always check ID for senior discounts
- **Staff Discount**: Staff must show employee ID
- **Cannot Combine**: Only one discount per transaction

---

## 📱 Phone Number Conflict Resolution

### The Problem
Previously, if a walk-in customer tried to sign up for membership using the same phone number, the system would show an error: "Phone number already exists."

### The Solution
New backend endpoints handle this automatically:

#### For Walk-in to Membership Upgrades
1. **Automatic Detection**: System checks if phone number exists
2. **Smart Upgrade**: Converts walk-in profile to membership
3. **Data Preservation**: Keeps all existing customer information
4. **Tag Updates**: Adds membership tags and removes walk-in tags
5. **Seamless Process**: Customer doesn't experience any errors

#### Backend Endpoints
- `POST /upgrade-walkin-to-membership`: Handles the upgrade process
- `GET /check-contact/:phone`: Checks if contact exists

### Staff Training
**When customers want to upgrade from walk-in to membership:**
1. ✅ Proceed normally with membership signup
2. ✅ System will automatically handle phone number conflicts
3. ✅ Customer profile gets upgraded, not duplicated
4. ✅ All previous visit history is preserved

---

## 💵 Cash Payment Calculator

### Features
- **Smart Calculator**: Built-in keypad for amount entry
- **Quick Select**: Common bill amounts ($20, $50, $100)
- **Change Calculation**: Automatically calculates change to give
- **Input Validation**: Prevents invalid entries
- **Visual Feedback**: Clear display of transaction details

### How to Use
1. Customer selects items and clicks "💵 PAY CASH"
2. Cash calculator opens in full-screen mode
3. Enter amount received from customer:
   - Use on-screen keypad, OR
   - Type directly in input field, OR
   - Click quick-select amount buttons
4. Calculator shows:
   - Order total
   - Amount received
   - **Change to give customer**
5. Click "Complete Payment" when ready
6. System shows final confirmation with change amount

### Training Tips
- **Double-Check**: Always verify the amount before completing
- **Count Back**: Count change back to customer
- **Large Bills**: For $50+ bills, verify authenticity
- **Receipt**: Always offer printed receipt

---

## 🔗 GHL Integration

### What is GoHighLevel (GHL)?
GoHighLevel is the Customer Relationship Management (CRM) system that:
- 📊 Stores all customer data
- 📦 Manages inventory levels
- 🏷️ Tracks product information
- 📧 Handles marketing automation
- 💳 Processes membership payments

### How POS Connects to GHL
1. **Authentication**: OAuth tokens for secure connection
2. **Real-time Sync**: Inventory updates instantly
3. **Customer Profiles**: All sales linked to customer records
4. **Automated Workflows**: Triggers in GHL based on POS actions

### Key Integration Points
- **Product Catalog**: All items loaded from GHL
- **Inventory Updates**: Stock decreases on each sale
- **Customer Creation**: New walk-ins automatically added
- **Payment Logging**: All transactions recorded
- **Tag Management**: Customer types tracked via tags

### Troubleshooting Connection Issues
If GHL connection fails:
1. Check internet connection
2. Verify OAuth tokens in backend
3. Check GHL system status
4. Contact technical support if needed

---

## 🔧 Troubleshooting

### Common Issues & Solutions

#### "No products loading"
- **Cause**: GHL connection issue
- **Solution**: Restart backend server, check tokens

#### "Discount button not working"
- **Cause**: Empty cart
- **Solution**: Add items to cart first

#### "Stock levels incorrect"
- **Cause**: Sync delay
- **Solution**: Wait 30 seconds, refresh inventory

#### "Email alerts not working"
- **Cause**: Email configuration
- **Solution**: Check EMAIL_USER and EMAIL_PASS in environment

#### "Cash calculator not opening"
- **Cause**: JavaScript error
- **Solution**: Refresh page, try again

### Emergency Procedures

#### If POS System Goes Down
1. **Manual Sales**: Use backup cash register
2. **Record Transactions**: Write down all sales for later entry
3. **Contact Support**: Call technical support immediately
4. **Customer Service**: Inform customers of temporary delay

#### If GHL System is Unavailable
1. **Continue Sales**: POS has backup inventory data
2. **Manual Tracking**: Keep written record of stock changes
3. **Sync Later**: Update GHL when system returns
4. **Monitor Stock**: Extra attention to inventory levels

### Contact Information
- **Technical Support**: [Support Contact]
- **GHL Admin**: [GHL Admin Contact]
- **Manager**: [Manager Contact]

---

## 📋 Quick Reference

### Daily Checklist
- [ ] Check email for low stock alerts
- [ ] Verify cash drawer balance
- [ ] Test payment systems (card reader)
- [ ] Review previous day's sales
- [ ] Confirm all systems connected

### Weekly Tasks
- [ ] Full inventory review
- [ ] Restock low items
- [ ] Update pricing if needed
- [ ] Review customer feedback
- [ ] Backup transaction data

### Monthly Goals
- [ ] Analyze sales trends
- [ ] Optimize product placement
- [ ] Update staff training
- [ ] Review and update procedures
- [ ] Plan for seasonal changes

---

*This guide is updated regularly. Last updated: August 2025*
*For questions or updates, contact the technical team.*
