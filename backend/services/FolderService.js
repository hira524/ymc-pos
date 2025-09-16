const Folder = require('../models/Folder');
const Product = require('../models/Product');

class FolderService {
  
  // Initialize default folders
  static async initializeDefaultFolders() {
    try {
      console.log('🔄 Initializing default folders...');
      
      const existingCount = await Folder.countDocuments();
      if (existingCount > 0) {
        console.log(`📁 Found ${existingCount} existing folders`);
        return await Folder.findActive();
      }

      const createdFolders = await Folder.createDefaultFolders();
      console.log(`✅ Created ${createdFolders.length} default folders`);
      
      return createdFolders;
    } catch (error) {
      console.error('Error initializing default folders:', error);
      throw error;
    }
  }

  // Get all active folders
  static async getAllFolders() {
    try {
      const folders = await Folder.findActive();
      
      // Update product counts for each folder
      for (const folder of folders) {
        await folder.updateProductCount();
      }
      
      return folders;
    } catch (error) {
      console.error('Error fetching folders:', error);
      throw error;
    }
  }

  // Get folder by ID
  static async getFolderById(id) {
    try {
      const folder = await Folder.findOne({ _id: id, isActive: true });
      if (folder) {
        await folder.updateProductCount();
      }
      return folder;
    } catch (error) {
      console.error('Error fetching folder by ID:', error);
      throw error;
    }
  }

  // Create new folder
  static async createFolder(folderData) {
    try {
      const { name, description, color, icon } = folderData;
      
      // Check if folder with this name already exists
      const existingFolder = await Folder.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        isActive: true 
      });
      
      if (existingFolder) {
        throw new Error('A folder with this name already exists');
      }

      const nextOrder = await Folder.getNextOrder();
      
      const folder = new Folder({
        name: name.trim(),
        description: description?.trim() || '',
        color: color || '#667eea',
        icon: icon || '📁',
        order: nextOrder,
        isActive: true,
        isDefault: false,
        productCount: 0
      });

      const savedFolder = await folder.save();
      console.log(`✅ Created folder: ${savedFolder.name}`);
      
      return savedFolder;
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  }

  // Update folder
  static async updateFolder(id, updateData) {
    try {
      const folder = await this.getFolderById(id);
      if (!folder) {
        throw new Error('Folder not found');
      }

      // If name is being updated, check for duplicates
      if (updateData.name && updateData.name !== folder.name) {
        const existingFolder = await Folder.findOne({ 
          name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
          isActive: true,
          _id: { $ne: id }
        });
        
        if (existingFolder) {
          throw new Error('A folder with this name already exists');
        }
      }

      // Update allowed fields
      const allowedFields = ['name', 'description', 'color', 'icon', 'order'];
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          folder[field] = updateData[field];
        }
      });

      folder.updatedAt = new Date();
      const updatedFolder = await folder.save();

      // If name changed, update all products in this folder
      if (updateData.name && updateData.name !== folder.name) {
        await Product.updateMany(
          { folderId: folder._id },
          { folderName: updateData.name }
        );
      }

      console.log(`✅ Updated folder: ${updatedFolder.name}`);
      return updatedFolder;
    } catch (error) {
      console.error('Error updating folder:', error);
      throw error;
    }
  }

  // Delete folder (soft delete)
  static async deleteFolder(id) {
    try {
      const folder = await this.getFolderById(id);
      if (!folder) {
        throw new Error('Folder not found');
      }

      // Check if folder has products
      const productCount = await Product.countDocuments({ 
        folderId: folder._id, 
        isActive: true 
      });

      let movedProductsCount = 0;

      if (productCount > 0) {
        // Move products to "Unassigned" folder
        const unassignedFolder = await this.ensureUnassignedFolder();

        // Update each product individually to ensure folderName is set
        const products = await Product.find({ folderId: folder._id, isActive: true });
        for (const product of products) {
          await product.updateFolder(unassignedFolder._id, unassignedFolder.name);
        }
        
        movedProductsCount = products.length;
        console.log(`📦 Moved ${products.length} products to Unassigned folder`);
      }

      // Soft delete the folder
      folder.isActive = false;
      folder.updatedAt = new Date();
      await folder.save();

      console.log(`🗑️ Deleted folder: ${folder.name}`);
      return {
        folder,
        message: `Successfully deleted folder "${folder.name}" and moved ${movedProductsCount} product(s) to Unassigned folder`,
        movedProductsCount
      };
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  }

  // Delete folder and all products inside (permanent deletion)
  static async deleteFolderAndProducts(id) {
    try {
      const folder = await this.getFolderById(id);
      if (!folder) {
        throw new Error('Folder not found');
      }

      // Get products in this folder
      const products = await Product.find({ 
        folderId: folder._id, 
        isActive: true 
      });

      const deletedProductsCount = products.length;

      // Soft delete all products in the folder
      if (deletedProductsCount > 0) {
        await Product.updateMany(
          { folderId: folder._id },
          { 
            isActive: false,
            updatedAt: new Date()
          }
        );
        console.log(`🗑️ Deleted ${deletedProductsCount} products from folder`);
      }

      // Soft delete the folder
      folder.isActive = false;
      folder.updatedAt = new Date();
      await folder.save();

      console.log(`🗑️ Deleted folder and all products: ${folder.name}`);
      return {
        folder,
        message: `Successfully deleted folder "${folder.name}" and ${deletedProductsCount} product(s)`,
        deletedProductsCount
      };
    } catch (error) {
      console.error('Error deleting folder and products:', error);
      throw error;
    }
  }

  // Ensure "Unassigned" folder exists
  static async ensureUnassignedFolder() {
    try {
      let unassignedFolder = await Folder.findOne({ 
        name: 'Unassigned', 
        isActive: true 
      });

      if (!unassignedFolder) {
        // Create the Unassigned folder
        const highestOrder = await Folder.findOne(
          { isActive: true },
          { order: 1 }
        ).sort({ order: -1 });

        unassignedFolder = await Folder.create({
          name: 'Unassigned',
          description: 'Default folder for products without a specific category',
          color: '#9ca3af',
          icon: '📦',
          order: (highestOrder?.order || 0) + 1,
          isDefault: true,
          isActive: true
        });

        console.log('📁 Created Unassigned folder');
      }

      return unassignedFolder;
    } catch (error) {
      console.error('Error ensuring Unassigned folder:', error);
      throw error;
    }
  }

  // Reorder folders
  static async reorderFolders(folderIds) {
    try {
      const updates = [];
      
      for (let i = 0; i < folderIds.length; i++) {
        const folderId = folderIds[i];
        const newOrder = i + 1;
        
        updates.push(
          Folder.updateOne(
            { _id: folderId },
            { order: newOrder, updatedAt: new Date() }
          )
        );
      }

      await Promise.all(updates);
      console.log(`🔄 Reordered ${folderIds.length} folders`);
      
      return await this.getAllFolders();
    } catch (error) {
      console.error('Error reordering folders:', error);
      throw error;
    }
  }

  // Get folder statistics
  static async getFolderStats() {
    try {
      const folders = await Folder.findActive();
      const totalProducts = await Product.countDocuments({ isActive: true });
      
      const stats = {
        totalFolders: folders.length,
        totalProducts: totalProducts,
        folders: folders.map(folder => ({
          id: folder._id,
          name: folder.name,
          productCount: folder.productCount,
          color: folder.color,
          icon: folder.icon
        }))
      };

      return stats;
    } catch (error) {
      console.error('Error getting folder stats:', error);
      throw error;
    }
  }

  // Move product to folder
  static async moveProductToFolder(productId, folderId) {
    try {
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const folder = await this.getFolderById(folderId);
      if (!folder) {
        throw new Error('Folder not found');
      }

      await product.updateFolder(folder._id, folder.name);
      
      // Update product counts for affected folders
      if (product.folderId && product.folderId.toString() !== folderId) {
        const oldFolder = await this.getFolderById(product.folderId);
        if (oldFolder) {
          await oldFolder.updateProductCount();
        }
      }
      
      await folder.updateProductCount();

      console.log(`📦 Moved product ${product.name} to folder ${folder.name}`);
      return product;
    } catch (error) {
      console.error('Error moving product to folder:', error);
      throw error;
    }
  }

  // Get products by folder
  static async getProductsByFolder(folderId) {
    try {
      return await Product.findByFolder(folderId);
    } catch (error) {
      console.error('Error getting products by folder:', error);
      throw error;
    }
  }

  // Sync existing products with folders based on category
  static async syncProductsWithFolders() {
    try {
      console.log('🔄 Syncing existing products with folders...');
      
      const products = await Product.find({ isActive: true });
      const folders = await Folder.findActive();
      
      const folderMap = {};
      folders.forEach(folder => {
        folderMap[folder.name.toLowerCase()] = folder;
      });

      let syncedCount = 0;
      
      for (const product of products) {
        if (!product.folderId && product.category) {
          const categoryLower = product.category.toLowerCase();
          
          // Try to match category with folder name
          let targetFolder = folderMap[categoryLower];
          
          // If no exact match, try partial matches
          if (!targetFolder) {
            for (const [folderName, folder] of Object.entries(folderMap)) {
              if (categoryLower.includes(folderName) || folderName.includes(categoryLower)) {
                targetFolder = folder;
                break;
              }
            }
          }
          
          // If still no match, use General folder
          if (!targetFolder) {
            targetFolder = folderMap['general'];
          }
          
          if (targetFolder) {
            await product.updateFolder(targetFolder._id, targetFolder.name);
            syncedCount++;
          }
        }
      }

      // Update all folder product counts
      for (const folder of folders) {
        await folder.updateProductCount();
      }

      console.log(`✅ Synced ${syncedCount} products with folders`);
      return { syncedCount, totalProducts: products.length };
    } catch (error) {
      console.error('Error syncing products with folders:', error);
      throw error;
    }
  }
}

module.exports = FolderService;