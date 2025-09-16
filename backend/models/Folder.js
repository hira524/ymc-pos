const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  color: {
    type: String,
    default: '#667eea',
    match: /^#[0-9A-Fa-f]{6}$/
  },
  icon: {
    type: String,
    default: '📁',
    maxlength: 10
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  productCount: {
    type: Number,
    default: 0
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
folderSchema.index({ name: 1 });
folderSchema.index({ order: 1 });
folderSchema.index({ isActive: 1 });

// Pre-save middleware to update the updatedAt field
folderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance method to update product count
folderSchema.methods.updateProductCount = async function() {
  const Product = require('./Product');
  this.productCount = await Product.countDocuments({ 
    folderId: this._id, 
    isActive: true 
  });
  return this.save();
};

// Static method to find active folders
folderSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ order: 1, name: 1 });
};

// Static method to get next order number
folderSchema.statics.getNextOrder = async function() {
  const lastFolder = await this.findOne().sort({ order: -1 });
  return lastFolder ? lastFolder.order + 1 : 1;
};

// Static method to create default folders
folderSchema.statics.createDefaultFolders = async function() {
  const defaultFolders = [
    {
      name: 'Beverages',
      description: 'Soft drinks, juices, and refreshing beverages',
      color: '#4facfe',
      icon: '🥤',
      order: 1,
      isDefault: true
    },
    {
      name: 'Frozen Drinks',
      description: 'Slushies and frozen beverages',
      color: '#43e97b',
      icon: '🧊',
      order: 2,
      isDefault: true
    },
    {
      name: 'Juices',
      description: 'Fresh juices and fruit drinks',
      color: '#fa709a',
      icon: '🧃',
      order: 3,
      isDefault: true
    },
    {
      name: 'Water',
      description: 'Bottled water and hydration products',
      color: '#00d2ff',
      icon: '💧',
      order: 4,
      isDefault: true
    },
    {
      name: 'Services',
      description: 'Service-based products and bookings',
      color: '#667eea',
      icon: '🛎️',
      order: 5,
      isDefault: true
    },
    {
      name: 'General',
      description: 'Other products and miscellaneous items',
      color: '#764ba2',
      icon: '📦',
      order: 6,
      isDefault: true
    },
    {
      name: 'Unassigned',
      description: 'Products without a specific category',
      color: '#9ca3af',
      icon: '📂',
      order: 7,
      isDefault: true
    }
  ];

  const createdFolders = [];
  for (const folderData of defaultFolders) {
    try {
      const existingFolder = await this.findOne({ name: folderData.name });
      if (!existingFolder) {
        const folder = new this(folderData);
        const savedFolder = await folder.save();
        createdFolders.push(savedFolder);
      }
    } catch (error) {
      console.error(`Error creating default folder ${folderData.name}:`, error);
    }
  }

  return createdFolders;
};

// Virtual for formatted color
folderSchema.virtual('formattedColor').get(function() {
  return this.color || '#667eea';
});

// Ensure virtuals are included in JSON output
folderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Folder', folderSchema);