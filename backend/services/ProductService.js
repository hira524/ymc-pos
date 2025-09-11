const Product = require('../models/Product');

class ProductService {
  
  // Initialize database with default products
  static async initializeDefaultProducts() {
    try {
      console.log('🔄 Initializing default products in MongoDB...');
      
      const existingCount = await Product.countDocuments();
      if (existingCount > 0) {
        console.log(`📦 Found ${existingCount} existing products in database`);
        return await Product.findActive();
      }

      const defaultProducts = [
        {
          name: '250ml Soft Drink Can - Coke Zero',
          price: 2.00,
          quantity: 20,
          description: 'Refreshing zero-calorie cola drink',
          category: 'Beverages'
        },
        {
          name: 'Slushie 12 oz - Coke',
          price: 2.50,
          quantity: 20,
          description: 'Frozen coke slushie, 12 oz size',
          category: 'Frozen Drinks'
        },
        {
          name: 'Slushie 12 oz - Berry Blast',
          price: 2.50,
          quantity: 20,
          description: 'Frozen berry flavored slushie, 12 oz size',
          category: 'Frozen Drinks'
        },
        {
          name: 'Slushie 12 oz - Mixed',
          price: 2.50,
          quantity: 20,
          description: 'Mixed flavor frozen slushie, 12 oz size',
          category: 'Frozen Drinks'
        },
        {
          name: 'Slushie 16 oz - Coke',
          price: 4.50,
          quantity: 20,
          description: 'Frozen coke slushie, 16 oz size',
          category: 'Frozen Drinks'
        },
        {
          name: 'Slushie 16 oz - Berry Blast',
          price: 4.50,
          quantity: 20,
          description: 'Frozen berry flavored slushie, 16 oz size',
          category: 'Frozen Drinks'
        },
        {
          name: 'Slushie 16 oz - Mixed',
          price: 4.50,
          quantity: 20,
          description: 'Mixed flavor frozen slushie, 16 oz size',
          category: 'Frozen Drinks'
        },
        {
          name: '250ml Soft Drink Can - Fanta',
          price: 2.00,
          quantity: 20,
          description: 'Orange flavored soft drink',
          category: 'Beverages'
        },
        {
          name: '250ml Soft Drink Can - Coke',
          price: 2.00,
          quantity: 20,
          description: 'Classic coca-cola soft drink',
          category: 'Beverages'
        },
        {
          name: '250ml Soft Drink Can - Sprite',
          price: 2.00,
          quantity: 20,
          description: 'Lemon-lime flavored soft drink',
          category: 'Beverages'
        },
        {
          name: '250ml Pop Top - Apple',
          price: 2.50,
          quantity: 20,
          description: 'Apple juice with pop top lid',
          category: 'Juices'
        },
        {
          name: '250ml Pop Top - Apple & Blackcurrant',
          price: 2.50,
          quantity: 20,
          description: 'Apple and blackcurrant juice with pop top lid',
          category: 'Juices'
        },
        {
          name: '250ml Bottled Water',
          price: 1.00,
          quantity: 20,
          description: 'Pure bottled water',
          category: 'Water'
        },
        {
          name: 'South Ripley',
          price: 0.00,
          quantity: 20,
          description: 'South Ripley location service',
          category: 'Services',
          productType: 'SERVICE'
        },
        {
          name: 'The Heights Estate in Pimpama',
          price: 0.00,
          quantity: 20,
          description: 'The Heights Estate in Pimpama location service',
          category: 'Services',
          productType: 'SERVICE'
        },
        {
          name: 'YM Community NDIS Housing',
          price: 0.00,
          quantity: 20,
          description: 'YM Community NDIS Housing service',
          category: 'Services',
          productType: 'SERVICE'
        },
        {
          name: 'Board Room Booking',
          price: 0.00,
          quantity: 20,
          description: 'Board room booking service with multiple pricing options',
          category: 'Services',
          productType: 'DIGITAL'
        }
      ];

      const createdProducts = [];
      for (let i = 0; i < defaultProducts.length; i++) {
        const productData = defaultProducts[i];
        const timestamp = Date.now();
        const productId = `mongodb-product-${timestamp}-${i}`;
        const priceId = `mongodb-price-${timestamp}-${i}`;

        const product = new Product({
          ...productData,
          productId,
          priceId,
          sku: productData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          source: 'mongodb'
        });

        try {
          const savedProduct = await product.save();
          createdProducts.push(savedProduct);
          console.log(`✅ Created: ${savedProduct.name} - ${savedProduct.formattedPrice}`);
        } catch (error) {
          console.error(`❌ Failed to create ${productData.name}:`, error.message);
        }
      }

      console.log(`🎉 Successfully initialized ${createdProducts.length} products in MongoDB`);
      return createdProducts;
    } catch (error) {
      console.error('❌ Failed to initialize default products:', error);
      throw error;
    }
  }

  // Get all active products
  static async getAllProducts() {
    try {
      return await Product.findActive();
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  // Get product by ID
  static async getProductById(id) {
    try {
      const mongoose = require('mongoose');
      
      // Try to find by MongoDB _id first (most common case)
      if (mongoose.Types.ObjectId.isValid(id)) {
        const product = await Product.findOne({ _id: id, isActive: true });
        if (product) return product;
      }
      
      // Fallback to finding by productId or priceId
      return await Product.findOne({ 
        $or: [
          { productId: id },
          { priceId: id }
        ],
        isActive: true 
      });
    } catch (error) {
      console.error('Error fetching product by ID:', error);
      throw error;
    }
  }

  // Create new product
  static async createProduct(productData) {
    try {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      
      const product = new Product({
        ...productData,
        productId: productData.productId || `mongodb-product-${timestamp}-${randomSuffix}`,
        priceId: productData.priceId || `mongodb-price-${timestamp}-${randomSuffix}`,
        sku: productData.sku || productData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        source: 'mongodb'
      });

      return await product.save();
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  // Update product
  static async updateProduct(id, updateData) {
    try {
      const product = await this.getProductById(id);
      if (!product) {
        throw new Error('Product not found');
      }

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          product[key] = updateData[key];
        }
      });

      return await product.save();
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  // Delete product (soft delete)
  static async deleteProduct(id) {
    try {
      const product = await this.getProductById(id);
      if (!product) {
        throw new Error('Product not found');
      }

      product.isActive = false;
      return await product.save();
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  // Update quantity
  static async updateQuantity(id, quantity) {
    try {
      const product = await this.getProductById(id);
      if (!product) {
        throw new Error('Product not found');
      }

      return await product.updateQuantity(quantity);
    } catch (error) {
      console.error('Error updating quantity:', error);
      throw error;
    }
  }

  // Process sale (decrease quantities)
  static async processSale(cartItems) {
    try {
      const updates = [];
      
      for (const item of cartItems) {
        const product = await this.getProductById(item.id);
        if (!product) {
          throw new Error(`Product not found: ${item.id}`);
        }

        if (product.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.quantity}, Requested: ${item.quantity}`);
        }

        const updatedProduct = await product.decreaseQuantity(item.quantity);
        updates.push({
          product: updatedProduct,
          oldQuantity: product.quantity + item.quantity,
          newQuantity: updatedProduct.quantity,
          soldQuantity: item.quantity
        });
      }

      return updates;
    } catch (error) {
      console.error('Error processing sale:', error);
      throw error;
    }
  }

  // Search products
  static async searchProducts(query) {
    try {
      return await Product.find({
        isActive: true,
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { description: { $regex: query, $options: 'i' } },
          { category: { $regex: query, $options: 'i' } },
          { sku: { $regex: query, $options: 'i' } }
        ]
      }).sort({ name: 1 });
    } catch (error) {
      console.error('Error searching products:', error);
      throw error;
    }
  }

  // Get products by category
  static async getProductsByCategory(category) {
    try {
      return await Product.find({
        isActive: true,
        category: { $regex: category, $options: 'i' }
      }).sort({ name: 1 });
    } catch (error) {
      console.error('Error fetching products by category:', error);
      throw error;
    }
  }

  // Get low stock products
  static async getLowStockProducts(threshold = 5) {
    try {
      return await Product.find({
        isActive: true,
        quantity: { $lte: threshold }
      }).sort({ quantity: 1, name: 1 });
    } catch (error) {
      console.error('Error fetching low stock products:', error);
      throw error;
    }
  }

  // Bulk update quantities
  static async bulkUpdateQuantities(updates) {
    try {
      const results = [];
      
      for (const update of updates) {
        const result = await this.updateQuantity(update.id, update.quantity);
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error('Error bulk updating quantities:', error);
      throw error;
    }
  }

  // Export products data (for backup/sync)
  static async exportProducts() {
    try {
      const products = await Product.find({ isActive: true }).sort({ name: 1 });
      return products.map(product => ({
        name: product.name,
        productId: product.productId,
        priceId: product.priceId,
        price: product.price,
        quantity: product.quantity,
        description: product.description,
        category: product.category,
        sku: product.sku,
        productType: product.productType,
        source: product.source,
        lastSynced: product.lastSynced
      }));
    } catch (error) {
      console.error('Error exporting products:', error);
      throw error;
    }
  }
}

module.exports = ProductService;
