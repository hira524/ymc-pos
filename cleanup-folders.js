// Cleanup script to consolidate folders and move products to Unassigned
const axios = require('axios');

const BACKEND_URL = 'http://localhost:5000';

async function cleanupFoldersAndProducts() {
  console.log('🧹 Starting folder cleanup and product consolidation...\n');

  try {
    // Get all folders and products
    console.log('📁 Getting current folders and products...');
    const [foldersResponse, productsResponse] = await Promise.all([
      axios.get(`${BACKEND_URL}/mongodb/folders`),
      axios.get(`${BACKEND_URL}/mongodb/inventory`)
    ]);

    const folders = foldersResponse.data.folders;
    const products = productsResponse.data;

    console.log(`Found ${folders.length} folders and ${products.length} products\n`);

    // Find the Unassigned folder
    const unassignedFolder = folders.find(f => f.name === 'Unassigned' && f.isDefault);
    if (!unassignedFolder) {
      console.log('❌ No Unassigned folder found!');
      return;
    }
    console.log(`✅ Found Unassigned folder: ${unassignedFolder.id}\n`);

    // Move all products without folder assignment to Unassigned
    const unassignedProducts = products.filter(p => !p.folderId || !p.folderName);
    console.log(`📦 Found ${unassignedProducts.length} products without folder assignment`);

    for (const product of unassignedProducts) {
      try {
        await axios.put(`${BACKEND_URL}/mongodb/inventory/${product._id}/move-folder`, {
          folderId: unassignedFolder.id
        });
        console.log(`✅ Moved "${product.name}" to Unassigned folder`);
      } catch (error) {
        console.log(`❌ Failed to move "${product.name}": ${error.response?.data?.error || error.message}`);
      }
    }

    // Delete test folders (but keep their products in Unassigned)
    const testFolders = folders.filter(f => 
      f.name.toLowerCase().includes('test') || 
      (f.name !== 'Unassigned' && !f.isDefault && f.productCount === 0)
    );

    console.log(`\n🗑️ Removing ${testFolders.length} test/empty folders...`);
    for (const folder of testFolders) {
      try {
        // Move any products to Unassigned first, then delete
        await axios.delete(`${BACKEND_URL}/mongodb/folders/${folder.id}?moveProducts=true`);
        console.log(`✅ Deleted folder: "${folder.name}"`);
      } catch (error) {
        console.log(`❌ Failed to delete "${folder.name}": ${error.response?.data?.error || error.message}`);
      }
    }

    // Final verification
    console.log('\n📊 Final verification...');
    const finalFoldersResponse = await axios.get(`${BACKEND_URL}/mongodb/folders`);
    const finalProductsResponse = await axios.get(`${BACKEND_URL}/mongodb/inventory`);
    
    const finalFolders = finalFoldersResponse.data.folders;
    const finalProducts = finalProductsResponse.data;
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`📁 Remaining folders: ${finalFolders.length}`);
    finalFolders.forEach(f => console.log(`   - ${f.name} (${f.productCount} products)`));
    
    const unassignedFinalProducts = finalProducts.filter(p => !p.folderId);
    if (unassignedFinalProducts.length === 0) {
      console.log(`📦 All ${finalProducts.length} products are properly assigned to folders`);
    } else {
      console.log(`⚠️ ${unassignedFinalProducts.length} products still without folder assignment`);
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error.response?.data || error.message);
  }
}

// Run the cleanup
cleanupFoldersAndProducts();