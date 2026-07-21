import mongoose from "mongoose";
import dotenv from "dotenv";
import bcryptjs from "bcryptjs";

import connectDb from "../config/connectDb.js";
import UserModel from "../models/user.model.js";
import CategoryModel from "../models/category.model.js";
import SubCategoryModel from "../models/subcategory.model.js";
import ProductModel from "../models/product.model.js";
import AddressModel from "../models/address.model.js";
import OrderModel from "../models/order.model.js";
import CampaignModel from "../models/campaign.model.js";
import DeliveryZoneModel from "../models/deliveryZone.model.js";
import CouponModel from "../models/coupon.model.js";
import ProductRequestModel from "../models/productRequest.model.js";
import RoleModel from "../models/role.model.js";
import { ensureSystemRoles } from "../controllers/role.controller.js";

dotenv.config();

// ------------------------------------------------------------------
// 1. CATEGORY + SUBCATEGORY DEFINITIONS (5 categories x 4 subcategories = 20)
// ------------------------------------------------------------------
const categoryData = [
  {
    name: "Fruits & Vegetables",
    image: "https://placehold.co/400x400/16a34a/ffffff?text=Fruits+%26+Veg",
    subCategories: ["Fresh Fruits", "Fresh Vegetables", "Herbs & Seasonings", "Organic Produce"],
  },
  {
    name: "Dairy & Bakery",
    image: "https://placehold.co/400x400/eab308/ffffff?text=Dairy+%26+Bakery",
    subCategories: ["Milk & Cream", "Cheese & Butter", "Bread & Bakery", "Eggs"],
  },
  {
    name: "Snacks & Beverages",
    image: "https://placehold.co/400x400/f97316/ffffff?text=Snacks",
    subCategories: ["Chips & Namkeen", "Biscuits & Cookies", "Soft Drinks", "Tea & Coffee"],
  },
  {
    name: "Meat & Seafood",
    image: "https://placehold.co/400x400/dc2626/ffffff?text=Meat+%26+Seafood",
    subCategories: ["Chicken", "Beef & Mutton", "Fish", "Frozen Seafood"],
  },
  {
    name: "Grains & Pulses",
    image: "https://placehold.co/400x400/65a30d/ffffff?text=Grains",
    subCategories: ["Rice", "Flour & Atta", "Lentils & Pulses", "Cooking Oil"],
  },
];

const productNamesBySubCategory = {
  "Fresh Fruits": ["Red Apple", "Banana", "Mango", "Orange", "Seedless Grapes"],
  "Fresh Vegetables": ["Potato", "Tomato", "Onion", "Carrot", "Cauliflower"],
  "Herbs & Seasonings": ["Fresh Ginger", "Garlic", "Green Chili", "Coriander Leaves", "Mint Leaves"],
  "Organic Produce": ["Organic Spinach", "Organic Tomato", "Organic Cucumber", "Organic Lettuce", "Organic Broccoli"],
  "Milk & Cream": ["Full Cream Milk 1L", "Low Fat Milk 1L", "Fresh Cream 200ml", "Condensed Milk", "Yogurt 500g"],
  "Cheese & Butter": ["Cheddar Cheese Block", "Mozzarella Cheese", "Salted Butter 200g", "Cream Cheese", "Processed Cheese Slices"],
  "Bread & Bakery": ["White Bread Loaf", "Whole Wheat Bread", "Burger Buns", "Croissant Pack", "Chocolate Muffins"],
  Eggs: ["Farm Eggs (12 pcs)", "Organic Eggs (6 pcs)", "Duck Eggs (6 pcs)", "Brown Eggs (12 pcs)", "Quail Eggs (20 pcs)"],
  "Chips & Namkeen": ["Potato Chips Classic", "Spicy Mixture Namkeen", "Banana Chips", "Corn Puffs", "Roasted Peanuts"],
  "Biscuits & Cookies": ["Chocolate Chip Cookies", "Cream Biscuits", "Digestive Biscuits", "Butter Cookies", "Oat Cookies"],
  "Soft Drinks": ["Cola 1.5L", "Lemon Soda 1.5L", "Orange Soda 1.5L", "Mineral Water 1L", "Energy Drink 250ml"],
  "Tea & Coffee": ["Black Tea Pack 200g", "Green Tea Bags", "Instant Coffee Jar", "Premium Coffee Beans", "Masala Tea Pack"],
  Chicken: ["Whole Chicken 1kg", "Chicken Breast 500g", "Chicken Drumsticks 1kg", "Chicken Wings 500g", "Boneless Chicken Thigh 1kg"],
  "Beef & Mutton": ["Beef Cubes 1kg", "Mutton Curry Cut 1kg", "Beef Mince 500g", "Mutton Chops 1kg", "Beef Steak 500g"],
  Fish: ["Rohu Fish 1kg", "Tilapia Fish 1kg", "Pangas Fish 1kg", "Hilsa Fish 1kg", "Salmon Fillet 500g"],
  "Frozen Seafood": ["Frozen Shrimp 500g", "Frozen Squid Rings 500g", "Frozen Fish Fillet 1kg", "Frozen Prawns 1kg", "Frozen Crab Meat 250g"],
  Rice: ["Basmati Rice 5kg", "Brown Rice 5kg", "Sona Masoori Rice 5kg", "Jasmine Rice 5kg", "Parboiled Rice 5kg"],
  "Flour & Atta": ["Whole Wheat Atta 5kg", "All Purpose Flour 2kg", "Rice Flour 1kg", "Corn Flour 500g", "Gram Flour 1kg"],
  "Lentils & Pulses": ["Red Lentils (Masoor) 1kg", "Yellow Split Peas 1kg", "Chickpeas 1kg", "Black Lentils 1kg", "Mung Beans 1kg"],
  "Cooking Oil": ["Sunflower Oil 5L", "Soybean Oil 5L", "Olive Oil 1L", "Mustard Oil 1L", "Vegetable Ghee 1kg"],
};

// ------------------------------------------------------------------
// 2. DEMO ACCOUNTS — full RBAC role spread
// ------------------------------------------------------------------
export const demoUsers = [
  { name: "Shah Owner",       email: "superadmin@shahpremiumfoods.com", password: "Super@123",  role: "SUPERADMIN", mobile: "+8801711000001" },
  { name: "Admin One",        email: "admin1@shahpremiumfoods.com",     password: "Admin@123",  role: "ADMIN",      mobile: "+8801711000002" },
  { name: "Admin Two",        email: "admin2@shahpremiumfoods.com",     password: "Admin@123",  role: "ADMIN",      mobile: "+8801711000003" },
  { name: "Manager Mim",      email: "manager@shahpremiumfoods.com",    password: "Mgr@12345",  role: "MANAGER",    mobile: "+8801711000004" },
  { name: "Staff Emon",       email: "staff@shahpremiumfoods.com",      password: "Stf@12345",  role: "STAFF",      mobile: "+8801711000005" },
  { name: "Analyst Anika",    email: "analyst@shahpremiumfoods.com",    password: "Analyst@123",role: "ANALYST",    mobile: "+8801711000006" },
  { name: "Rahim Uddin",      email: "user1@shahpremiumfoods.com",      password: "User@123",   role: "USER",       mobile: "+8801911000001" },
  { name: "Karim Hossain",    email: "user2@shahpremiumfoods.com",      password: "User@123",   role: "USER",       mobile: "+8801911000002" },
  { name: "Fatima Begum",     email: "user3@shahpremiumfoods.com",      password: "User@123",   role: "USER",       mobile: "+8801911000003" },
  { name: "Ayesha Siddiqua",  email: "user4@shahpremiumfoods.com",      password: "User@123",   role: "USER",       mobile: "+8801911000004" },
  { name: "Imran Khan",       email: "user5@shahpremiumfoods.com",      password: "User@123",   role: "USER",       mobile: "+8801911000005" },
];

const randomPrice = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const seedDatabase = async () => {
  try {
    await connectDb();

    console.log("Clearing existing data...");
    await Promise.all([
      UserModel.deleteMany({}),
      CategoryModel.deleteMany({}),
      SubCategoryModel.deleteMany({}),
      ProductModel.deleteMany({}),
      AddressModel.deleteMany({}),
      OrderModel.deleteMany({}),
      CampaignModel.deleteMany({}),
      DeliveryZoneModel.deleteMany({}),
      CouponModel.deleteMany({}),
      ProductRequestModel.deleteMany({}),
      RoleModel.deleteMany({}),
    ]);

    console.log("Creating system roles...");
    await ensureSystemRoles();

    // ---------------- USERS ----------------
    console.log("Seeding users...");
    const createdUsers = [];
    for (const user of demoUsers) {
      const salt = await bcryptjs.genSalt(10);
      const hashedPassword = await bcryptjs.hash(user.password, salt);

      const created = await UserModel.create({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        mobile: user.mobile,
        verify_email: true,
        status: "Active",
      });
      createdUsers.push(created);
    }
    const customerUsers = createdUsers.filter((u) => u.role === "USER");

    // ---------------- ADDRESSES for customers ----------------
    console.log("Seeding addresses...");
    const cities = [
      { city: "Dhaka", state: "Dhaka Division", pincode: "1205" },
      { city: "Chattogram", state: "Chattogram Division", pincode: "4000" },
      { city: "Sylhet", state: "Sylhet Division", pincode: "3100" },
      { city: "Khulna", state: "Khulna Division", pincode: "9000" },
      { city: "Rajshahi", state: "Rajshahi Division", pincode: "6000" },
    ];
    const addressByUser = {};
    for (const user of customerUsers) {
      const loc = pick(cities);
      const addr = await AddressModel.create({
        address_line: `House ${randomPrice(1, 99)}, Road ${randomPrice(1, 20)}`,
        city: loc.city, state: loc.state, pincode: loc.pincode, country: "Bangladesh",
        mobile: user.mobile, userId: user._id, status: true,
      });
      addressByUser[user._id.toString()] = addr;
      await UserModel.updateOne({ _id: user._id }, { $push: { address_details: addr._id } });
    }

    // ---------------- CATEGORIES + SUBCATEGORIES + PRODUCTS ----------------
    console.log("Seeding categories, subcategories and products...");
    const allProducts = [];

    for (const cat of categoryData) {
      const category = await CategoryModel.create({ name: cat.name, image: cat.image });

      for (const subName of cat.subCategories) {
        const subCategory = await SubCategoryModel.create({
          name: subName,
          image: `https://placehold.co/300x300/0ea5e9/ffffff?text=${encodeURIComponent(subName)}`,
          category: [category._id],
        });

        const productNames = productNamesBySubCategory[subName] || [];

        for (const productName of productNames) {
          const price = randomPrice(50, 1500);
          const costPrice = Math.round(price * (randomPrice(55, 75) / 100)); // 55-75% of sale price
          const discount = pick([0, 0, 5, 10, 15, 20]);
          // Vary stock to populate inventory states: some 0 (out), some low (<10), most healthy
          const stockRoll = Math.random();
          const stock = stockRoll < 0.08 ? 0 : stockRoll < 0.2 ? randomPrice(1, 9) : randomPrice(20, 200);

          const product = await ProductModel.create({
            name: productName,
            image: [`https://placehold.co/500x500/22c55e/ffffff?text=${encodeURIComponent(productName)}`],
            category: [category._id],
            subCategory: [subCategory._id],
            unit: "1 pc",
            stock,
            lowStockThreshold: 10,
            price,
            costPrice,
            discount,
            sku: `SPF-${category.name.slice(0,3).toUpperCase()}-${randomPrice(1000,9999)}`,
            description: `${productName} - premium quality, sourced fresh for Shah Premium Foods customers.`,
            more_details: { brand: "Shah Premium Foods" },
            publish: true,
          });
          allProducts.push(product);
        }
      }
    }

    // ---------------- DELIVERY ZONES ----------------
    console.log("Seeding delivery zones...");
    await DeliveryZoneModel.create([
      {
        name: "Inside Dhaka", matchCities: ["Dhaka"], charge: 60,
        freeDeliveryThreshold: 1000, estimatedDays: "1-2 days",
        isDefault: false, isActive: true, displayOrder: 0,
      },
      {
        name: "Outside Dhaka", matchCities: ["Chattogram", "Sylhet", "Khulna", "Rajshahi"], charge: 120,
        freeDeliveryThreshold: 2000, estimatedDays: "3-5 days",
        isDefault: true, isActive: true, displayOrder: 1,
      },
    ]);

    // ---------------- DEMO ORDERS (so analytics/best-selling have real data) ----------------
    console.log("Seeding demo orders...");
    const statuses = ["Pending", "Confirmed", "On-Hold", "On the way", "Delivered", "Delivered", "Delivered", "Cancelled", "Return"];
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    // Bias: first 25 products sell often (best sellers), next 25 sell rarely (low sellers),
    // remaining stay unsold (never-sold quadrant naturally emerges)
    const bestSellers = allProducts.slice(0, 25);
    const lowSellers   = allProducts.slice(25, 50);

    let orderCount = 0;
    for (let i = 0; i < 140; i++) {
      const user = pick(customerUsers);
      const address = addressByUser[user._id.toString()];
      const daysAgo = randomPrice(0, 75);
      const createdAt = new Date(now - daysAgo * DAY - randomPrice(0, DAY));

      const useBest = Math.random() < 0.7;
      const pool = useBest ? bestSellers : lowSellers;
      const itemCount = randomPrice(1, 4);
      const chosen = Array.from({ length: itemCount }, () => pick(pool));

      const productDetails = chosen.map((p) => ({
        productId: p._id, name: p.name, image: p.image,
        quantity: randomPrice(1, 3), price: p.price, costPrice: p.costPrice,
      }));
      const subTotal = productDetails.reduce((s, it) => s + it.price * it.quantity, 0);
      const discountAmt = Math.random() < 0.2 ? Math.round(subTotal * 0.1) : 0;
      const status = daysAgo < 1 ? pick(["Pending", "Confirmed", "On-Hold"]) : pick(statuses);

      // Delivery charge mirrors the seeded zones — Dhaka vs everywhere else —
      // waived automatically once the order clears that zone's free threshold.
      const isDhaka = address.city === "Dhaka";
      const zoneName = isDhaka ? "Inside Dhaka" : "Outside Dhaka";
      const baseCharge = isDhaka ? 60 : 120;
      const freeThreshold = isDhaka ? 1000 : 2000;
      const deliveryCharge = subTotal >= freeThreshold ? 0 : baseCharge;

      const order = await OrderModel.create({
        userId: user._id,
        orderId: `ORD-${now - i * 1000}-${randomPrice(1000, 9999)}`,
        productDetails,
        paymentId: "",
        payment_status: Math.random() < 0.5 ? "CASH ON DELIVERY" : "paid",
        delivery_address: address._id,
        subTotalAmt: subTotal,
        discountAmt,
        deliveryCharge,
        deliveryZoneName: zoneName,
        totalAmt: subTotal - discountAmt + deliveryCharge,
        order_status: status,
        statusHistory: [{ status, note: "Seed data", changedAt: createdAt }],
        customerSnapshot: { name: user.name, email: user.email, mobile: user.mobile },
        createdAt,
        updatedAt: createdAt,
      });
      // Override timestamps (timestamps:true auto-sets on create, so patch directly)
      await OrderModel.updateOne({ _id: order._id }, { createdAt, updatedAt: createdAt });
      await UserModel.updateOne({ _id: user._id }, { $push: { orderHistory: order._id } });
      orderCount++;
    }

    // ---------------- CAMPAIGNS (custom-named promo sections) ----------------
    console.log("Seeding campaigns...");
    const weekendProducts = allProducts.slice(50, 62); // 12 mid-range products
    await CampaignModel.create({
      name: "Weekend Mega Sale",
      icon: "bolt",
      description: "Up to 30% off on selected groceries — this weekend only!",
      startTime: new Date(now - 1 * DAY),
      endTime: new Date(now + 3 * DAY),
      products: weekendProducts.map((p) => ({
        productId: p._id,
        specialDiscount: pick([15, 20, 25, 30]),
        specialPrice: 0,
      })),
      isActive: true,
      showOnHomepage: true,
      showOnProductPage: true,
      displayOrder: 0,
      badgeColor: "#ef4444",
    });

    const eidProducts = allProducts.slice(62, 70); // 8 products
    await CampaignModel.create({
      name: "Eid Special Offers",
      icon: "gift",
      description: "Celebrate with great savings on festive favourites.",
      startTime: new Date(now - 2 * DAY),
      endTime: new Date(now + 10 * DAY),
      products: eidProducts.map((p) => ({
        productId: p._id,
        specialDiscount: pick([10, 15, 20]),
        specialPrice: 0,
      })),
      isActive: true,
      showOnHomepage: true,
      showOnProductPage: false,
      displayOrder: 1,
      badgeColor: "#16a34a",
    });

    // ---------------- COUPONS ----------------
    console.log("Seeding coupons...");
    await CouponModel.create([
      {
        code: "WELCOME10", type: "percentage", value: 10, minOrderAmount: 300, maxDiscount: 150,
        usageLimit: 0, validFrom: new Date(now - 30 * DAY), validTo: new Date(now + 60 * DAY),
        isActive: true, description: "10% off for new customers (max ৳150 off, min order ৳300)",
      },
      {
        code: "FLAT100", type: "fixed", value: 100, minOrderAmount: 500, maxDiscount: 0,
        usageLimit: 200, validFrom: new Date(now - 10 * DAY), validTo: new Date(now + 30 * DAY),
        isActive: true, description: "Flat ৳100 off on orders above ৳500",
      },
      {
        code: "EXPIRED5", type: "percentage", value: 5, minOrderAmount: 0, maxDiscount: 0,
        usageLimit: 0, validFrom: new Date(now - 60 * DAY), validTo: new Date(now - 30 * DAY),
        isActive: true, description: "Old expired test coupon",
      },
    ]);

    // ---------------- PRODUCT REQUESTS (demo customer shopping lists) ----------------
    console.log("Seeding sample product requests...");
    await ProductRequestModel.create([
      {
        userId: customerUsers[0]._id, type: "text",
        textContent: "2kg Basmati Rice\n1L Soybean Oil\n1 dozen Farm Eggs\n500g Red Lentils\n2 Red Apple",
        period: "weekly", status: "Pending",
        customerNote: "Please deliver in the evening if possible",
      },
      {
        userId: customerUsers[1]._id, type: "image",
        imageUrl: "https://placehold.co/600x800/f4f1ec/1c1c1a?text=Handwritten+Shopping+List",
        period: "monthly", status: "Processing", adminNote: "Called customer to confirm quantities",
      },
    ]);

    console.log("\n================ SEED COMPLETE ================");
    console.log(`Categories: 5 | Sub Categories: 20 | Products: ${allProducts.length} | Orders: ${orderCount}`);
    console.log("Campaigns: Weekend Mega Sale (12 products) + Eid Special Offers (8 products) | Coupons: WELCOME10, FLAT100, EXPIRED5(expired)");
    console.log("Delivery Zones: Inside Dhaka (৳60, free above ৳1000) + Outside Dhaka (৳120, free above ৳2000)");
    console.log("\nDemo accounts (email / password):");
    demoUsers.forEach((u) => {
      console.log(`  [${u.role}] ${u.email} / ${u.password}`);
    });
    console.log("=================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedDatabase();
