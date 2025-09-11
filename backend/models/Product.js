const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 20
  },
  description: {
    type: String,
    trim: true
  },
  productId: {
    type: String,
    required: true,
    unique: true
  },
  priceId: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: null
  },
  source: {
    type: String,
    enum: ['mongodb', 'ghl', 'manual', 'local'],
    default: 'mongodb'
  },
  productType: {
    type: String,
    enum: ['PHYSICAL', 'DIGITAL', 'SERVICE'],
    default: 'PHYSICAL'
  },
  availableInStore: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    trim: true
  },
  sku: {
    type: String,
    trim: true
  },
  lastSynced: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
productSchema.index({ name: 1 });
productSchema.index({ productId: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ source: 1 });

// Pre-save middleware to update the updatedAt field
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance method to update quantity
productSchema.methods.updateQuantity = function(quantity) {
  this.quantity = Math.max(0, quantity);
  this.updatedAt = new Date();
  return this.save();
};

// Instance method to decrease quantity (for sales)
productSchema.methods.decreaseQuantity = function(amount) {
  const newQuantity = Math.max(0, this.quantity - amount);
  this.quantity = newQuantity;
  this.updatedAt = new Date();
  return this.save();
};

// Static method to find active products
productSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ name: 1 });
};

// Static method to find products by source
productSchema.statics.findBySource = function(source) {
  return this.find({ source: source, isActive: true }).sort({ name: 1 });
};

// Virtual for formatted price
productSchema.virtual('formattedPrice').get(function() {
  return `AU$${this.price.toFixed(2)}`;
});

// Ensure virtuals are included in JSON output
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
