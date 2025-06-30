-- Sample SQL data for consignment store outdoor equipment
-- Test data for import functionality with various field naming conventions

CREATE TABLE IF NOT EXISTS outdoor_gear_inventory (
    item_id SERIAL PRIMARY KEY,
    item_title VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(100),
    product_category VARCHAR(100),
    dimensions VARCHAR(50),
    primary_color VARCHAR(50),
    wear_condition VARCHAR(50),
    retail_value DECIMAL(10,2),
    asking_price DECIMAL(10,2),
    item_notes TEXT,
    owner_email VARCHAR(255),
    owner_phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data with consistent naming
INSERT INTO outdoor_gear_inventory (
    item_title, manufacturer, product_category, dimensions, primary_color, 
    wear_condition, retail_value, asking_price, item_notes, owner_email, owner_phone
) VALUES 
('Mammut Trion Alpinist 28+7 Backpack', 'Mammut', 'Backpacks', '28+7L', 'graphite', 
 'Very Good', 189.95, 125.00, 'Technical alpine pack with helmet attachment. Used on 2 mountaineering trips.', 
 'summit.seeker@alpine.com', '555-1234'),

('Outdoor Research Ferrosi Pants', 'Outdoor Research', 'Pants', '32W x 32L', 'charcoal', 
 'Excellent', 139.00, 85.00, 'Wind-resistant softshell pants. Perfect for alpine climbing and hiking.', 
 'mountain.athlete@peaks.net', '555-5678'),

('La Sportiva Nepal Cube GTX Boots', 'La Sportiva', 'Footwear', 'EU 42 / US 9', 'yellow', 
 'Good', 599.95, 375.00, 'Double boots for high-altitude mountaineering. Some wear on outer shell.', 
 'ice.climber@frozen.peaks', '555-9012'),

('Petzl Grigri+ Belay Device', 'Petzl', 'Climbing Gear', 'standard', 'orange', 
 'Excellent', 109.95, 75.00, 'Assisted-braking belay device. Used less than 10 times.', 
 'rope.access@vertical.world', '555-3456'),

('Western Mountaineering Kodiak MF Sleeping Bag', 'Western Mountaineering', 'Sleep Systems', '6ft Regular', 'red', 
 'Very Good', 575.00, 395.00, '0°F down sleeping bag. Premium goose down fill. Stored uncompressed.', 
 'winter.camper@cold.mountains', '555-7890');

-- Alternative table structure with different field names (tests field mapping flexibility)
CREATE TABLE IF NOT EXISTS gear_consignment_alt (
    id INTEGER PRIMARY KEY,
    product_name VARCHAR(255),
    brand_name VARCHAR(100),
    gear_type VARCHAR(100),
    size_spec VARCHAR(50),
    color_way VARCHAR(50),
    condition_rating VARCHAR(50),
    original_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    description TEXT,
    seller_email VARCHAR(255),
    seller_phone VARCHAR(20),
    gender VARCHAR(20),
    material VARCHAR(100),
    date_added DATE DEFAULT CURRENT_DATE
);

INSERT INTO gear_consignment_alt (
    product_name, brand_name, gear_type, size_spec, color_way, 
    condition_rating, original_price, sale_price, description, seller_email, seller_phone, gender, material
) VALUES 
('Fjällräven Kånken 16L Daypack', 'Fjällräven', 'Backpacks', '16L', 'ox_red', 
 'Excellent', 80.00, 55.00, 'Classic Swedish daypack with laptop compartment. Minimal use, all zippers work perfectly.', 
 'urban.adventurer@city.trails', '555-4321', 'Unisex', 'Vinylon F'),

('Patagonia R1 Daily Jacket', 'Patagonia', 'Jackets', 'Large', 'forge_grey', 
 'Good', 199.00, 125.00, 'Polartec Power Grid fleece with excellent breathability. Some pilling but very functional.', 
 'fleece.lover@warm.layers', '555-8765', 'Men', 'Polartec Power Grid'),

('Arc''teryx Cerium LT Hoody', 'Arc''teryx', 'Jackets', 'Medium', 'black', 
 'Excellent', 399.00, 285.00, '850-fill down hoody with Coreloft synthetic in moisture-prone areas. Used twice.', 
 'down.specialist@warmth.experts', '555-2468', 'Men', 'Down/Synthetic'),

('Salomon Quest 4D 3 GTX Hiking Boots', 'Salomon', 'Footwear', 'US 10.5', 'wren_bungee_cord', 
 'Good', 230.00, 145.00, 'Waterproof hiking boots with Contagrip sole. Moderate wear but good tread remaining.', 
 'boot.tester@trail.miles', '555-1357', 'Men', 'Leather/Gore-Tex'),

('MSR Hubba Hubba NX 2-Person Tent', 'MSR', 'Accessories', '2_person', 'green', 
 'Very Good', 450.00, 295.00, 'Freestanding 3-season tent with dual vestibules. Minor wear on floor but no leaks.', 
 'tent.collector@sheltered.nights', '555-9753', 'Unisex', 'Nylon Ripstop');

-- Third table with completely different naming convention (extreme test case)
CREATE TABLE IF NOT EXISTS equipment_db (
    rec_id BIGINT PRIMARY KEY,
    name_of_item TEXT,
    company_brand VARCHAR(150),
    item_classification VARCHAR(120),
    measurement_info VARCHAR(80),
    main_color VARCHAR(60),
    current_state VARCHAR(60),
    msrp_value DECIMAL(12,2),
    listed_amount DECIMAL(12,2),
    additional_notes TEXT,
    contact_email VARCHAR(300),
    contact_phone VARCHAR(25),
    target_gender VARCHAR(30),
    fabric_material VARCHAR(150),
    entry_timestamp TIMESTAMP DEFAULT NOW()
);

INSERT INTO equipment_db (
    rec_id, name_of_item, company_brand, item_classification, measurement_info, main_color,
    current_state, msrp_value, listed_amount, additional_notes, contact_email, contact_phone, target_gender, fabric_material
) VALUES 
(1001, 'Black Diamond Momentum Climbing Harness', 'Black Diamond', 'Climbing Gear', 'Large', 'slate_blue',
     'Excellent', 60.00, 38.00, 'Comfort-focused climbing harness with trakFIT adjustment. Used less than 20 times.',
     'harness.user@vertical.routes', '555-8642', 'Unisex', 'Nylon Webbing'),

(1002, 'Osprey Farpoint 40 Travel Pack', 'Osprey', 'Backpacks', '40L', 'volcanic_grey',
     'Excellent', 160.00, 115.00, 'Carry-on sized travel pack with panel loading. Used on one trip, excellent condition.',
     'travel.packer@global.adventures', '555-7531', 'Unisex', 'Nylon Canvas'),

(1003, 'Patagonia Baggies Shorts 5-inch', 'Patagonia', 'Shorts', '32', 'navy_blue',
     'Good', 55.00, 32.00, 'Quick-dry nylon shorts perfect for hiking and swimming. Some fading but no damage.',
     'shorts.enthusiast@summer.hikes', '555-4826', 'Men', 'Recycled Nylon'),

(1004, 'Smartwool PhD Outdoor Light Crew Socks', 'Smartwool', 'Socks', 'Large', 'charcoal',
     'Excellent', 21.95, 14.00, 'Merino wool hiking socks with reinforced heel and toe. Lifetime warranty intact.',
     'wool.sock.fan@comfy.trails', '555-3951', 'Unisex', 'Merino Wool'),

(1005, 'Therm-a-Rest Z Lite Sol Sleeping Pad', 'Therm-a-Rest', 'Sleep Systems', 'Regular', 'silver_lemon',
     'Good', 50.00, 32.00, 'Closed-cell foam pad that never fails. Some compression but still provides good insulation.',
     'foam.pad.user@ground.comfort', '555-6284', 'Unisex', 'Closed Cell Foam');

-- Query examples for testing
-- SELECT * FROM outdoor_gear_inventory ORDER BY asking_price DESC;
-- SELECT * FROM gear_consignment_alt WHERE condition_rating = 'Excellent';
-- SELECT * FROM equipment_db WHERE target_gender = 'Unisex' AND msrp_value > 50.00; 