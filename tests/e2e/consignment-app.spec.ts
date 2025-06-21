import { test, expect } from '@playwright/test';

test.describe('Consignment Application E2E Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load homepage correctly', async ({ page }) => {
    // Check if the main elements are present
    await expect(page).toHaveTitle(/Consignment/);
    
    // Check if navigation is present
    await expect(page.locator('nav')).toBeVisible();
    
    // Check if login functionality is available
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
  });

  test('should handle authentication flow', async ({ page }) => {
    // Test login modal opening
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.locator('[data-testid="login-modal"]')).toBeVisible();
    
    // Test Google login button presence
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    
    // Test phone login option
    await expect(page.getByRole('button', { name: /phone/i })).toBeVisible();
    
    // Close modal
    await page.getByRole('button', { name: /close/i }).click();
    await expect(page.locator('[data-testid="login-modal"]')).not.toBeVisible();
  });

  test('should display items when available', async ({ page }) => {
    // Mock authentication state (you'd need to set this up with Firebase emulator)
    // For now, check if items container exists
    await expect(page.locator('[data-testid="items-container"]')).toBeVisible();
    
    // Check if filters are available
    await expect(page.locator('[data-testid="filters"]')).toBeVisible();
    
    // Check search functionality
    const searchInput = page.locator('input[placeholder*="search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test item');
      await searchInput.press('Enter');
    }
  });

  test('should handle cart functionality', async ({ page }) => {
    // Check cart button exists
    const cartButton = page.locator('[data-testid="cart-button"]');
    if (await cartButton.isVisible()) {
      await cartButton.click();
      
      // Check if cart modal opens
      await expect(page.locator('[data-testid="cart-modal"]')).toBeVisible();
      
      // Close cart modal
      await page.getByRole('button', { name: /close/i }).click();
    }
  });

  test('should handle bookmarks functionality', async ({ page }) => {
    // Check bookmarks button exists  
    const bookmarkButton = page.locator('[data-testid="bookmarks-button"]');
    if (await bookmarkButton.isVisible()) {
      await bookmarkButton.click();
      
      // Check if bookmarks modal opens
      await expect(page.locator('[data-testid="bookmarks-modal"]')).toBeVisible();
      
      // Close bookmarks modal
      await page.getByRole('button', { name: /close/i }).click();
    }
  });

  test('should handle item filtering', async ({ page }) => {
    // Test category filter
    const categorySelect = page.locator('select[name="category"]');
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption('Clothing');
    }
    
    // Test gender filter
    const genderSelect = page.locator('select[name="gender"]');
    if (await genderSelect.isVisible()) {
      await genderSelect.selectOption('Women');
    }
    
    // Test price range filter
    const priceSelect = page.locator('select[name="priceRange"]');
    if (await priceSelect.isVisible()) {
      await priceSelect.selectOption('0-50');
    }
    
    // Test clear filters
    const clearButton = page.getByRole('button', { name: /clear filters/i });
    if (await clearButton.isVisible()) {
      await clearButton.click();
    }
  });

  test('should handle admin functionality when logged in as admin', async ({ page }) => {
    // This would require mocking admin auth state
    // Check if admin buttons are available
    const adminButton = page.locator('[data-testid="admin-button"]');
    if (await adminButton.isVisible()) {
      await adminButton.click();
      
      // Check if admin modal opens
      await expect(page.locator('[data-testid="admin-modal"]')).toBeVisible();
      
      // Test admin navigation
      const dashboardTab = page.locator('[data-testid="dashboard-tab"]');
      if (await dashboardTab.isVisible()) {
        await dashboardTab.click();
      }
      
      // Close admin modal
      await page.getByRole('button', { name: /close/i }).click();
    }
  });

  test('should handle item detail modal', async ({ page }) => {
    // Find first item card and click it
    const itemCard = page.locator('[data-testid="item-card"]').first();
    if (await itemCard.isVisible()) {
      await itemCard.click();
      
      // Check if item detail modal opens
      await expect(page.locator('[data-testid="item-detail-modal"]')).toBeVisible();
      
      // Check if item details are displayed
      await expect(page.locator('[data-testid="item-title"]')).toBeVisible();
      await expect(page.locator('[data-testid="item-price"]')).toBeVisible();
      await expect(page.locator('[data-testid="item-description"]')).toBeVisible();
      
      // Test add to cart functionality
      const addToCartButton = page.getByRole('button', { name: /add to cart/i });
      if (await addToCartButton.isVisible()) {
        await addToCartButton.click();
      }
      
      // Close modal
      await page.getByRole('button', { name: /close/i }).click();
    }
  });

  test('should handle responsive design', async ({ page }) => {
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check if mobile menu is available
    const mobileMenu = page.locator('[data-testid="mobile-menu"]');
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
    }
    
    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Ensure main content is still visible
    await expect(page.locator('main')).toBeVisible();
  });

  test('should handle navigation between different views', async ({ page }) => {
    // Test analytics page
    const analyticsButton = page.locator('[data-testid="analytics-button"]');
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click();
      await expect(page.locator('[data-testid="analytics-page"]')).toBeVisible();
      
      // Navigate back to home
      const homeButton = page.locator('[data-testid="home-button"]');
      if (await homeButton.isVisible()) {
        await homeButton.click();
      }
    }
    
    // Test inventory dashboard
    const inventoryButton = page.locator('[data-testid="inventory-button"]');
    if (await inventoryButton.isVisible()) {
      await inventoryButton.click();
      await expect(page.locator('[data-testid="inventory-dashboard"]')).toBeVisible();
    }
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Test network error handling
    await page.route('**/api/**', route => route.abort());
    
    // Try to perform an action that requires network
    await page.reload();
    
    // Check if error message is displayed
    const errorMessage = page.locator('[data-testid="error-message"]');
    if (await errorMessage.isVisible()) {
      await expect(errorMessage).toContainText(/error|failed/i);
    }
    
    // Restore network
    await page.unroute('**/api/**');
  });

  test('should handle loading states', async ({ page }) => {
    // Check if loading indicators are shown during initial load
    const loadingIndicator = page.locator('[data-testid="loading"]');
    
    // Reload page and check for loading state
    await page.reload();
    
    // Loading should eventually disappear
    if (await loadingIndicator.isVisible()) {
      await expect(loadingIndicator).not.toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Performance Tests', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle large item lists efficiently', async ({ page }) => {
    await page.goto('/');
    
    // Check if virtualization or pagination is working
    // (This would depend on your implementation)
    const itemCards = page.locator('[data-testid="item-card"]');
    const count = await itemCards.count();
    
    // Should not render excessive DOM elements
    expect(count).toBeLessThan(100);
  });
});

test.describe('Accessibility Tests', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');
    
    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    
    // Check if focus is visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/');
    
    // Check for proper button labels
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i);
      const hasAriaLabel = await button.getAttribute('aria-label');
      const hasText = await button.textContent();
      
      // Button should have either aria-label or text content
      expect(hasAriaLabel || hasText).toBeTruthy();
    }
  });
}); 