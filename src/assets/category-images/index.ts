// Category-specific images for banners
// All new category images downloaded and ready to use!

// Import all category images
import climbingAction from './climbing-action.jpg';
import alpineClimbing from './alpine-climbing.jpg';
import mountainTrail from './mountain-trail.jpg';
import campsiteEvening from './campsite-evening.jpg';
import skiingPowder from './skiing-powder.jpg';
import snowboardJump from './snowboard-jump.jpg';
import whitewaterRafting from './whitewater-rafting.jpg';
import mountainBiking from './mountain-biking.jpg';
import outdoorClothing from './outdoor-clothing.jpg';
import hikingBoots from './hiking-boots.jpg';

// Export all images for use in components
export {
  climbingAction,
  alpineClimbing,
  mountainTrail,
  campsiteEvening,
  skiingPowder,
  snowboardJump,
  whitewaterRafting,
  mountainBiking,
  outdoorClothing,
  hikingBoots
};

// Default export for convenience
export default {
  climbingAction,
  alpineClimbing,
  mountainTrail,
  campsiteEvening,
  skiingPowder,
  snowboardJump,
  whitewaterRafting,
  mountainBiking,
  outdoorClothing,
  hikingBoots
};

// Instructions for adding new images:
// 1. Download the recommended images from Unsplash/Pexels
// 2. Resize to 1200x400px for optimal banner display
// 3. Save as JPG in this folder with the exact names listed above
// 4. Import them at the top of this file
// 5. Update the categoryImages object to use the new imports
// 6. Remove the TODO comments from CategoryDisplay.tsx and Home.tsx 