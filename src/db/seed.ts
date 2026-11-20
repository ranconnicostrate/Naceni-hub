import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  addresses,
  businessAccounts,
  categories,
  deliveries,
  inventory,
  invoices,
  notifications,
  orderItems,
  orders,
  payments,
  products,
  purchaseOrderItems,
  purchaseOrders,
  quotationItems,
  quotations,
  reorderRules,
  stockMovements,
  suppliers,
  users,
  warehouses,
  type TimelineEntry,
} from './schema.ts';
import { encryptSensitiveField } from '../server/utils/crypto.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      console.error('Database seed failed:', err);
    });
  }
  return seedPromise;
}

export async function runSeed(): Promise<void> {
  const adminEmail = (
    process.env.INITIAL_ADMIN_EMAIL || 'kinyarwaranconnicostrate@gmail.com'
  ).toLowerCase();
  const adminPasswordHash = process.env.INITIAL_ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD, 10)
    : null;

  const [superAdmin] = await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash: adminPasswordHash,
      fullName: 'Naceni Super Administrator',
      phone: '+250 788 000 101',
      role: 'SUPER_ADMIN',
      isActive: true,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        role: 'SUPER_ADMIN',
        isActive: true,
        ...(adminPasswordHash ? { passwordHash: adminPasswordHash } : {}),
      },
    })
    .returning();

  const [{ value: catCount }] = await db
    .select({ value: count() })
    .from(categories);

  if (catCount > 0) {
    return;
  }

  const [invManager] = await db
    .insert(users)
    .values({
      email: 'inventory@nacenis.rw',
      fullName: 'Eric Mugisha',
      phone: '+250 788 214 330',
      role: 'INVENTORY_MANAGER',
      isActive: true,
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning();

  const [b2bUser] = await db
    .insert(users)
    .values({
      email: 'procurement@horizonbuilders.rw',
      fullName: 'Claire Mukamana',
      phone: '+250 788 552 910',
      role: 'B2B_CUSTOMER',
      isActive: true,
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning();

  const [retailUser1] = await db
    .insert(users)
    .values({
      email: 'jeanpaul.habimana@gmail.com',
      fullName: 'Jean Paul Habimana',
      phone: '+250 783 410 882',
      role: 'REGULAR_CUSTOMER',
      isActive: true,
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning();

  const [retailUser2] = await db
    .insert(users)
    .values({
      email: 'aline.uwase@kigaliworks.rw',
      fullName: 'Aline Uwase',
      phone: '+250 788 730 112',
      role: 'B2B_CUSTOMER',
      isActive: true,
      emailVerified: true,
    })
    .onConflictDoNothing()
    .returning();

  const resolvedB2B =
    b2bUser ||
    (
      await db
        .select()
        .from(users)
        .where(eq(users.email, 'procurement@horizonbuilders.rw'))
        .limit(1)
    )[0];

  const resolvedRetail1 =
    retailUser1 ||
    (
      await db
        .select()
        .from(users)
        .where(eq(users.email, 'jeanpaul.habimana@gmail.com'))
        .limit(1)
    )[0];

  const resolvedRetail2 =
    retailUser2 ||
    (
      await db
        .select()
        .from(users)
        .where(eq(users.email, 'aline.uwase@kigaliworks.rw'))
        .limit(1)
    )[0];

  const resolvedInvMgr = invManager || superAdmin;

  const [b2bAccount] = await db
    .insert(businessAccounts)
    .values({
      userId: resolvedB2B.id,
      companyName: 'Horizon Civil & Builders Ltd',
      tinNumberEncrypted: encryptSensitiveField('104928371'),
      tinLastFour: '8371',
      industry: 'Commercial Construction & Infrastructure',
      creditLimitRwf: 45000000,
      paymentTerms: 'NET_30',
      verified: true,
    })
    .onConflictDoNothing()
    .returning();

  if (resolvedRetail2) {
    await db
      .insert(businessAccounts)
      .values({
        userId: resolvedRetail2.id,
        companyName: 'Kigali Urban Works SARL',
        tinNumberEncrypted: encryptSensitiveField('108844219'),
        tinLastFour: '4219',
        industry: 'MEP & Building Contractors',
        creditLimitRwf: 25000000,
        paymentTerms: 'NET_15',
        verified: true,
      })
      .onConflictDoNothing();
  }

  await db.insert(addresses).values([
    {
      userId: resolvedB2B.id,
      label: 'Kigali Heights Site B',
      recipientName: 'Claire Mukamana',
      phone: '+250 788 552 910',
      province: 'Kigali City',
      district: 'Gasabo',
      sector: 'Kacyiru',
      streetAddress: 'KG 7 Ave, Plot 42',
      isDefault: true,
    },
    {
      userId: resolvedRetail1.id,
      label: 'Residential Project',
      recipientName: 'Jean Paul Habimana',
      phone: '+250 783 410 882',
      province: 'Kigali City',
      district: 'Kicukiro',
      sector: 'Niboye',
      streetAddress: 'KK 19 Ave, Gate 14',
      isDefault: true,
    },
  ]);

  const insertedCategories = await db
    .insert(categories)
    .values([
      {
        name: 'Construction Tools',
        slug: 'construction-tools',
        description: 'Cordless power tools, rotary hammers, saws, and precision site instruments.',
        icon: 'hammer',
        sortOrder: 1,
      },
      {
        name: 'Plumbing Supplies',
        slug: 'plumbing-supplies',
        description: 'Forged pipe wrenches, PPR/PVC piping, brass valves, and drainage fittings.',
        icon: 'wrench',
        sortOrder: 2,
      },
      {
        name: 'Electrical Equipment',
        slug: 'electrical-equipment',
        description: 'Armored cables, DIN distribution panels, circuit breakers, and site reels.',
        icon: 'zap',
        sortOrder: 3,
      },
      {
        name: 'Building Materials',
        slug: 'building-materials',
        description: 'Structural steel rebar, Portland cement, masonry blocks, and aggregates.',
        icon: 'bricks',
        sortOrder: 4,
      },
      {
        name: 'Safety Equipment',
        slug: 'safety-equipment',
        description: 'ANSI hard hats, reflective vests, steel-toe boots, and fall harnesses.',
        icon: 'hard-hat',
        sortOrder: 5,
      },
      {
        name: 'Industrial Equipment',
        slug: 'industrial-equipment',
        description: 'Heavy-duty tool chests, concrete vibrators, generators, and site lighting.',
        icon: 'settings',
        sortOrder: 6,
      },
    ])
    .returning();

  const catBySlug = Object.fromEntries(insertedCategories.map((c) => [c.slug, c]));

  const insertedWarehouses = await db
    .insert(warehouses)
    .values([
      {
        name: 'Kigali Central Depot',
        code: 'KGL-MAIN',
        location: 'Special Economic Zone, Masoro, Kigali',
        managerName: 'Eric Mugisha',
        capacityUnits: 45000,
      },
      {
        name: 'Nyabugogo Bulk Yard',
        code: 'KGL-NYB',
        location: 'Nyabugogo Industrial Corridor, Kigali',
        managerName: 'Patrick Nshimiyimana',
        capacityUnits: 30000,
      },
      {
        name: 'Musanze Northern Hub',
        code: 'MSZ-NTH',
        location: 'Musanze Commercial Park, Northern Province',
        managerName: 'Diane Mukeshimana',
        capacityUnits: 18000,
      },
    ])
    .returning();

  const insertedSuppliers = await db
    .insert(suppliers)
    .values([
      {
        name: 'Kigali Industrial Hardware Ltd',
        contactPerson: 'David Gasana',
        email: 'supply@kigalihardware.rw',
        phone: '+250 788 301 200',
        address: 'Gikondo Industrial Area, Kigali',
        leadTimeDays: 3,
        rating: '4.90',
      },
      {
        name: 'East Africa Steel & Cement Co.',
        contactPerson: 'Grace Uwimana',
        email: 'orders@easteel.rw',
        phone: '+250 788 411 900',
        address: 'Bugesera Industrial Zone',
        leadTimeDays: 5,
        rating: '4.75',
      },
      {
        name: 'VoltPro Electrical Distributors',
        contactPerson: 'Samuel Habimana',
        email: 'sales@voltpro.co.rw',
        phone: '+250 788 612 440',
        address: 'Nyarugenge Trade Center, Kigali',
        leadTimeDays: 4,
        rating: '4.85',
      },
      {
        name: 'SafeSite PPE & Tools Corp',
        contactPerson: 'Alice Ingabire',
        email: 'b2b@safesite.rw',
        phone: '+250 788 790 510',
        address: 'Masoro SEZ Plot 18, Kigali',
        leadTimeDays: 2,
        rating: '4.95',
      },
    ])
    .returning();

  const [supHardware, supSteel, supVolt, supSafety] = insertedSuppliers;

  const productSeeds = [
    {
      sku: 'DR-001',
      name: '20V Brushless Hammer Drill Kit',
      slug: '20v-brushless-hammer-drill-kit',
      description:
        'Commercial-grade 20V MAX brushless cordless hammer drill driver with two 5.0Ah Li-Ion batteries, metal ratcheting chuck, and LED site light.',
      categoryId: catBySlug['construction-tools'].id,
      supplierId: supHardware.id,
      brand: 'DeWalt Pro',
      unitOfMeasure: 'Kit',
      retailPriceRwf: 120000,
      wholesalePriceRwf: 102000,
      bulkTiers: [
        { minQty: 5, discountPct: 8, unitPriceRwf: 110400 },
        { minQty: 15, discountPct: 15, unitPriceRwf: 102000 },
        { minQty: 30, discountPct: 20, unitPriceRwf: 96000 },
      ],
      imageUrl: '/src/assets/images/product_cordless_drill_1795165786389.jpg',
      availableStock: 45,
      minStockLevel: 10,
      reorderPoint: 15,
      reorderQuantity: 35,
      batchNumber: 'DW-2026-Q4',
      isFeatured: true,
      isBestSeller: true,
      promoBadge: 'Best Seller',
    },
    {
      sku: 'PW-002',
      name: 'Heavy-Duty 18" Forged Pipe Wrench',
      slug: 'heavy-duty-18-forged-pipe-wrench',
      description:
        'Drop-forged ductile iron housing with hardened alloy steel jaws, self-cleaning threads, and full-floating hook jaw for industrial plumbing.',
      categoryId: catBySlug['plumbing-supplies'].id,
      supplierId: supHardware.id,
      brand: 'Ridgid',
      unitOfMeasure: 'Piece',
      retailPriceRwf: 85000,
      wholesalePriceRwf: 71000,
      bulkTiers: [
        { minQty: 10, discountPct: 10, unitPriceRwf: 76500 },
        { minQty: 25, discountPct: 16, unitPriceRwf: 71400 },
      ],
      imageUrl: '/src/assets/images/product_pipe_wrench_1795165786666.jpg',
      availableStock: 8,
      minStockLevel: 10,
      reorderPoint: 12,
      reorderQuantity: 30,
      batchNumber: 'RD-2026-09',
      isFeatured: true,
      isBestSeller: false,
      promoBadge: 'Pro Grade',
    },
    {
      sku: 'EC-003',
      name: '3x2.5mm² PVC Armored Power Cable (50m)',
      slug: '3x25mm-pvc-armored-power-cable-50m',
      description:
        '50-meter coil of 600/1000V pure copper 3-core insulated industrial electrical power cable rated for conduit and underground site wiring.',
      categoryId: catBySlug['electrical-equipment'].id,
      supplierId: supVolt.id,
      brand: 'VoltPro',
      unitOfMeasure: 'Coil (50m)',
      retailPriceRwf: 75000,
      wholesalePriceRwf: 63000,
      bulkTiers: [
        { minQty: 10, discountPct: 10, unitPriceRwf: 67500 },
        { minQty: 40, discountPct: 16, unitPriceRwf: 63000 },
      ],
      imageUrl: '/src/assets/images/product_electrical_cable_1795165786797.jpg',
      availableStock: 120,
      minStockLevel: 50,
      reorderPoint: 60,
      reorderQuantity: 100,
      batchNumber: 'VP-2026-11',
      isFeatured: true,
      isBestSeller: true,
      promoBadge: 'Bulk Ready',
    },
    {
      sku: 'CB-004',
      name: '12-Way DIN Distribution Circuit Breaker Box',
      slug: '12-way-din-distribution-circuit-breaker-box',
      description:
        'IP65 weather-sealed 230V/400V DIN-rail distribution board complete with RCCB main isolator, 10 MCB circuits, and copper neutral busbar.',
      categoryId: catBySlug['electrical-equipment'].id,
      supplierId: supVolt.id,
      brand: 'Schrack Technik',
      unitOfMeasure: 'Unit',
      retailPriceRwf: 95000,
      wholesalePriceRwf: 81000,
      bulkTiers: [
        { minQty: 5, discountPct: 8, unitPriceRwf: 87400 },
        { minQty: 20, discountPct: 15, unitPriceRwf: 80750 },
      ],
      imageUrl: '/src/assets/images/product_circuit_breaker_1795165787061.jpg',
      availableStock: 0,
      minStockLevel: 5,
      reorderPoint: 8,
      reorderQuantity: 25,
      batchNumber: 'SC-2026-08',
      isFeatured: true,
      isBestSeller: false,
      promoBadge: 'Restocking',
    },
    {
      sku: 'SH-005',
      name: 'ANSI Type I Industrial Safety Helmet',
      slug: 'ansi-type-i-industrial-safety-helmet',
      description:
        'High-density polyethylene shell with 6-point ratchet suspension, accessory slots for earmuffs/visors, and Class E electrical insulation.',
      categoryId: catBySlug['safety-equipment'].id,
      supplierId: supSafety.id,
      brand: 'SafeSite',
      unitOfMeasure: 'Piece',
      retailPriceRwf: 30000,
      wholesalePriceRwf: 22500,
      bulkTiers: [
        { minQty: 20, discountPct: 15, unitPriceRwf: 25500 },
        { minQty: 100, discountPct: 25, unitPriceRwf: 22500 },
      ],
      imageUrl: '/src/assets/images/product_safety_helmet_1795165786767.jpg',
      availableStock: 185,
      minStockLevel: 40,
      reorderPoint: 50,
      reorderQuantity: 150,
      batchNumber: 'SS-2026-10',
      isFeatured: true,
      isBestSeller: true,
      promoBadge: 'Site Standard',
    },
    {
      sku: 'BM-006',
      name: 'High-Strength Masonry Block Pallet (100 pcs)',
      slug: 'high-strength-masonry-block-pallet',
      description:
        'Vibrated hollow concrete structural masonry blocks (400x200x200mm), cured to 7.5 MPa compressive strength for load-bearing walls.',
      categoryId: catBySlug['building-materials'].id,
      supplierId: supSteel.id,
      brand: 'RwandaCrete',
      unitOfMeasure: 'Pallet (100 pcs)',
      retailPriceRwf: 110000,
      wholesalePriceRwf: 94000,
      bulkTiers: [
        { minQty: 5, discountPct: 10, unitPriceRwf: 99000 },
        { minQty: 20, discountPct: 15, unitPriceRwf: 93500 },
      ],
      imageUrl: '/src/assets/images/promo_bulk_warehouse_1795165786437.jpg',
      availableStock: 68,
      minStockLevel: 15,
      reorderPoint: 20,
      reorderQuantity: 50,
      batchNumber: 'RC-2026-11',
      isFeatured: true,
      isBestSeller: true,
      promoBadge: 'Free Delivery Eligible',
    },
    {
      sku: 'IE-007',
      name: '12mm Deformed Structural Steel Rebar (12m)',
      slug: '12mm-deformed-structural-steel-rebar',
      description:
        'B500B high-tensile ribbed reinforcing steel bar (12mm diameter, 12m length) certified for reinforced concrete slabs and columns.',
      categoryId: catBySlug['building-materials'].id,
      supplierId: supSteel.id,
      brand: 'EA Steel',
      unitOfMeasure: 'Bar (12m)',
      retailPriceRwf: 14500,
      wholesalePriceRwf: 12800,
      bulkTiers: [
        { minQty: 50, discountPct: 8, unitPriceRwf: 13340 },
        { minQty: 200, discountPct: 12, unitPriceRwf: 12760 },
      ],
      imageUrl: '/src/assets/images/promo_bulk_warehouse_1795165786437.jpg',
      availableStock: 640,
      minStockLevel: 150,
      reorderPoint: 200,
      reorderQuantity: 500,
      batchNumber: 'ES-2026-11',
      isFeatured: false,
      isBestSeller: true,
      promoBadge: null,
    },
    {
      sku: 'PL-008',
      name: 'Industrial PPR Hot/Cold Pressure Pipe (4m)',
      slug: 'industrial-ppr-pressure-pipe-4m',
      description:
        'PN20 32mm Polypropylene Random Copolymer pipe for high-pressure potable water and commercial HVAC manifolds.',
      categoryId: catBySlug['plumbing-supplies'].id,
      supplierId: supHardware.id,
      brand: 'AquaFlow',
      unitOfMeasure: 'Length (4m)',
      retailPriceRwf: 18500,
      wholesalePriceRwf: 15200,
      bulkTiers: [
        { minQty: 25, discountPct: 12, unitPriceRwf: 16280 },
        { minQty: 100, discountPct: 18, unitPriceRwf: 15170 },
      ],
      imageUrl: '/src/assets/images/product_pipe_wrench_1795165786666.jpg',
      availableStock: 210,
      minStockLevel: 60,
      reorderPoint: 80,
      reorderQuantity: 200,
      batchNumber: 'AF-2026-10',
      isFeatured: false,
      isBestSeller: false,
      promoBadge: null,
    },
    {
      sku: 'CT-009',
      name: '230mm Heavy-Duty Angle Grinder (2400W)',
      slug: '230mm-heavy-duty-angle-grinder-2400w',
      description:
        'High-torque 2400W masonry and steel cutting grinder with soft-start motor, vibration-control side handle, and burst-proof guard.',
      categoryId: catBySlug['construction-tools'].id,
      supplierId: supHardware.id,
      brand: 'DeWalt Pro',
      unitOfMeasure: 'Unit',
      retailPriceRwf: 165000,
      wholesalePriceRwf: 142000,
      bulkTiers: [
        { minQty: 5, discountPct: 10, unitPriceRwf: 148500 },
        { minQty: 12, discountPct: 14, unitPriceRwf: 141900 },
      ],
      imageUrl: '/src/assets/images/product_cordless_drill_1795165786389.jpg',
      availableStock: 26,
      minStockLevel: 8,
      reorderPoint: 10,
      reorderQuantity: 20,
      batchNumber: 'DW-2026-10',
      isFeatured: false,
      isBestSeller: true,
      promoBadge: '10% Off Bulk',
    },
    {
      sku: 'IE-010',
      name: '5.5kVA Industrial Site Power Generator',
      slug: '5-5kva-industrial-site-power-generator',
      description:
        'AVR-regulated copper-winding site generator with twin 16A weatherproof sockets, steel roll cage, and low-oil automatic shutdown.',
      categoryId: catBySlug['industrial-equipment'].id,
      supplierId: supVolt.id,
      brand: 'TitanPower',
      unitOfMeasure: 'Unit',
      retailPriceRwf: 780000,
      wholesalePriceRwf: 695000,
      bulkTiers: [
        { minQty: 2, discountPct: 6, unitPriceRwf: 733200 },
        { minQty: 5, discountPct: 11, unitPriceRwf: 694200 },
      ],
      imageUrl: '/src/assets/images/product_circuit_breaker_1795165787061.jpg',
      availableStock: 11,
      minStockLevel: 4,
      reorderPoint: 5,
      reorderQuantity: 8,
      batchNumber: 'TP-2026-09',
      isFeatured: false,
      isBestSeller: false,
      promoBadge: 'Free Delivery',
    },
  ];

  const insertedProducts = await db
    .insert(products)
    .values(productSeeds)
    .returning();

  const prodBySku = Object.fromEntries(insertedProducts.map((p) => [p.sku, p]));

  // Seed inventory per warehouse & reorder rules
  const invRows: {
    productId: number;
    warehouseId: number;
    quantityOnHand: number;
    binLocation: string;
    batchCode: string;
  }[] = [];

  const ruleRows: {
    productId: number;
    supplierId: number | null;
    minStockLevel: number;
    reorderPoint: number;
    reorderQuantity: number;
    leadTimeDays: number;
    autoDraftPo: boolean;
    isActive: boolean;
  }[] = [];

  for (let i = 0; i < insertedProducts.length; i++) {
    const p = insertedProducts[i];
    const mainQty = Math.ceil(p.availableStock * 0.7);
    const nybQty = p.availableStock - mainQty;
    invRows.push({
      productId: p.id,
      warehouseId: insertedWarehouses[0].id,
      quantityOnHand: mainQty,
      binLocation: `A${(i % 4) + 1}-0${i + 1}`,
      batchCode: p.batchNumber || 'BATCH-2026-A',
    });
    if (nybQty > 0) {
      invRows.push({
        productId: p.id,
        warehouseId: insertedWarehouses[1].id,
        quantityOnHand: nybQty,
        binLocation: `B${(i % 3) + 1}-0${i + 1}`,
        batchCode: p.batchNumber || 'BATCH-2026-A',
      });
    }
    ruleRows.push({
      productId: p.id,
      supplierId: p.supplierId,
      minStockLevel: p.minStockLevel,
      reorderPoint: p.reorderPoint,
      reorderQuantity: p.reorderQuantity,
      leadTimeDays: 4,
      autoDraftPo: true,
      isActive: true,
    });
  }

  await db.insert(inventory).values(invRows);
  await db.insert(reorderRules).values(ruleRows);

  // Seed initial stock movements
  await db.insert(stockMovements).values([
    {
      productId: prodBySku['DR-001'].id,
      warehouseId: insertedWarehouses[0].id,
      type: 'INCOMING',
      quantityDelta: 50,
      previousStock: 0,
      newStock: 50,
      referenceType: 'PURCHASE_ORDER',
      referenceId: 'PO-2026-0912',
      notes: 'Q4 DeWalt container restock received at Kigali Central Depot',
      performedById: resolvedInvMgr.id,
    },
    {
      productId: prodBySku['PW-002'].id,
      warehouseId: insertedWarehouses[0].id,
      type: 'OUTGOING',
      quantityDelta: -12,
      previousStock: 20,
      newStock: 8,
      referenceType: 'ORDER',
      referenceId: 'ORD-2026-1047',
      notes: 'Dispatched to Horizon Builders plumbing crew',
      performedById: resolvedInvMgr.id,
    },
    {
      productId: prodBySku['CB-004'].id,
      warehouseId: insertedWarehouses[0].id,
      type: 'OUTGOING',
      quantityDelta: -9,
      previousStock: 9,
      newStock: 0,
      referenceType: 'ORDER',
      referenceId: 'ORD-2026-1046',
      notes: 'Final batch allocated to Kigali Urban Works',
      performedById: resolvedInvMgr.id,
    },
  ]);

  // Auto-draft Purchase Order for Out-of-Stock CB-004 & Low-Stock PW-002
  const [draftPo] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: 'PO-2026-1088',
      supplierId: supVolt.id,
      status: 'DRAFT',
      totalCostRwf: 1580000,
      expectedDeliveryDate: new Date(Date.now() + 4 * 86400000),
      notes: 'Automated reorder draft triggered for out-of-stock CB-004 (Circuit Breaker Box).',
      isAutoGenerated: true,
      createdById: resolvedInvMgr.id,
    })
    .returning();

  await db.insert(purchaseOrderItems).values({
    purchaseOrderId: draftPo.id,
    productId: prodBySku['CB-004'].id,
    quantityOrdered: 25,
    quantityReceived: 0,
    unitCostRwf: 63200,
    lineTotalRwf: 1580000,
  });

  // Seed historical & active orders across 2026 months so Recharts charts are 100% real DB aggregations
  const orderSeeds = [
    {
      orderNumber: 'ORD-2026-1041',
      userId: resolvedB2B.id,
      orderType: 'B2B_BULK',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      monthsAgo: 5,
      items: [
        { prod: prodBySku['BM-006'], qty: 40, price: 93500 },
        { prod: prodBySku['IE-007'], qty: 350, price: 12760 },
      ],
      provider: 'BANK_TRANSFER',
      deliveryStatus: 'DELIVERED',
      driver: 'Emmanuel Habineza',
      plate: 'RAE 412 C',
    },
    {
      orderNumber: 'ORD-2026-1042',
      userId: resolvedRetail2.id,
      orderType: 'B2B_BULK',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      monthsAgo: 4,
      items: [
        { prod: prodBySku['EC-003'], qty: 80, price: 63000 },
        { prod: prodBySku['CB-004'], qty: 35, price: 80750 },
      ],
      provider: 'MTN_MOMO',
      deliveryStatus: 'DELIVERED',
      driver: 'Claude Ndayisaba',
      plate: 'RAF 889 B',
    },
    {
      orderNumber: 'ORD-2026-1043',
      userId: resolvedB2B.id,
      orderType: 'B2B_BULK',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      monthsAgo: 3,
      items: [
        { prod: prodBySku['IE-010'], qty: 8, price: 694200 },
        { prod: prodBySku['DR-001'], qty: 45, price: 96000 },
        { prod: prodBySku['SH-005'], qty: 140, price: 22500 },
      ],
      provider: 'BANK_TRANSFER',
      deliveryStatus: 'DELIVERED',
      driver: 'Emmanuel Habineza',
      plate: 'RAE 412 C',
    },
    {
      orderNumber: 'ORD-2026-1044',
      userId: resolvedRetail2.id,
      orderType: 'B2B_BULK',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      monthsAgo: 2,
      items: [
        { prod: prodBySku['PL-008'], qty: 240, price: 15170 },
        { prod: prodBySku['PW-002'], qty: 45, price: 71400 },
        { prod: prodBySku['CT-009'], qty: 24, price: 141900 },
      ],
      provider: 'AIRTEL_MONEY',
      deliveryStatus: 'DELIVERED',
      driver: 'Patrick Kamanzi',
      plate: 'RAG 204 D',
    },
    {
      orderNumber: 'ORD-2026-1045',
      userId: resolvedB2B.id,
      orderType: 'B2B_BULK',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      monthsAgo: 1,
      items: [
        { prod: prodBySku['BM-006'], qty: 65, price: 93500 },
        { prod: prodBySku['EC-003'], qty: 90, price: 63000 },
        { prod: prodBySku['DR-001'], qty: 30, price: 96000 },
      ],
      provider: 'BANK_TRANSFER',
      deliveryStatus: 'DELIVERED',
      driver: 'Emmanuel Habineza',
      plate: 'RAE 412 C',
    },
    {
      orderNumber: 'ORD-2026-1046',
      userId: resolvedRetail1.id,
      orderType: 'RETAIL',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      monthsAgo: 0,
      items: [
        { prod: prodBySku['DR-001'], qty: 2, price: 120000 },
        { prod: prodBySku['SH-005'], qty: 6, price: 30000 },
      ],
      provider: 'MTN_MOMO',
      deliveryStatus: 'SCHEDULED',
      driver: 'Claude Ndayisaba',
      plate: 'RAF 889 B',
    },
    {
      orderNumber: 'ORD-2026-1047',
      userId: resolvedB2B.id,
      orderType: 'B2B_BULK',
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      monthsAgo: 0,
      items: [
        { prod: prodBySku['PW-002'], qty: 12, price: 76500 },
        { prod: prodBySku['PL-008'], qty: 60, price: 16280 },
      ],
      provider: 'BANK_TRANSFER',
      deliveryStatus: 'ASSIGNED',
      driver: 'Patrick Kamanzi',
      plate: 'RAG 204 D',
    },
    {
      orderNumber: 'ORD-2026-1048',
      userId: resolvedRetail2.id,
      orderType: 'B2B_BULK',
      status: 'IN_TRANSIT',
      paymentStatus: 'PAID',
      monthsAgo: 0,
      items: [
        { prod: prodBySku['EC-003'], qty: 20, price: 67500 },
        { prod: prodBySku['CT-009'], qty: 6, price: 148500 },
      ],
      provider: 'CARD_GATEWAY',
      deliveryStatus: 'IN_TRANSIT',
      driver: 'Emmanuel Habineza',
      plate: 'RAE 412 C',
    },
  ];

  for (const seedOrd of orderSeeds) {
    const createdAt = new Date();
    createdAt.setMonth(createdAt.getMonth() - seedOrd.monthsAgo);

    const subtotal = seedOrd.items.reduce(
      (sum, item) => sum + item.qty * item.price,
      0
    );
    const deliveryFee = subtotal >= 500000 ? 0 : 15000;
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + deliveryFee + tax;

    const timeline: TimelineEntry[] = [
      {
        status: 'PENDING',
        timestamp: createdAt.toISOString(),
        note: 'Order placed via Naceni platform',
        actor: 'Customer',
      },
      {
        status: 'CONFIRMED',
        timestamp: createdAt.toISOString(),
        note: 'Stock reserved and order confirmed',
        actor: 'System',
      },
    ];
    if (
      ['PROCESSING', 'IN_TRANSIT', 'DELIVERED'].includes(seedOrd.status)
    ) {
      timeline.push({
        status: 'PROCESSING',
        timestamp: createdAt.toISOString(),
        note: 'Warehouse picking and quality check',
        actor: 'Warehouse Staff',
      });
    }
    if (['IN_TRANSIT', 'DELIVERED'].includes(seedOrd.status)) {
      timeline.push({
        status: 'IN_TRANSIT',
        timestamp: createdAt.toISOString(),
        note: `Dispatched with driver ${seedOrd.driver}`,
        actor: 'Delivery Manager',
      });
    }
    if (seedOrd.status === 'DELIVERED') {
      timeline.push({
        status: 'DELIVERED',
        timestamp: createdAt.toISOString(),
        note: 'Signed and delivered on site',
        actor: seedOrd.driver,
      });
    }

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderNumber: seedOrd.orderNumber,
        userId: seedOrd.userId,
        orderType: seedOrd.orderType,
        status: seedOrd.status,
        paymentStatus: seedOrd.paymentStatus,
        subtotalRwf: subtotal,
        discountRwf: 0,
        deliveryFeeRwf: deliveryFee,
        taxRwf: tax,
        totalRwf: total,
        shippingAddress: {
          recipientName:
            seedOrd.userId === resolvedB2B.id
              ? 'Claire Mukamana'
              : 'Jean Paul Habimana',
          phone: '+250 788 552 910',
          province: 'Kigali City',
          district: 'Gasabo',
          sector: 'Kacyiru',
          streetAddress: 'KG 7 Ave, Construction Site Plot 42',
        },
        statusTimeline: timeline,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();

    await db.insert(orderItems).values(
      seedOrd.items.map((item) => ({
        orderId: createdOrder.id,
        productId: item.prod.id,
        productName: item.prod.name,
        sku: item.prod.sku,
        quantity: item.qty,
        fulfilledQuantity: seedOrd.status === 'DELIVERED' ? item.qty : 0,
        unitPriceRwf: item.price,
        lineTotalRwf: item.qty * item.price,
      }))
    );

    await db.insert(payments).values({
      transactionRef: `TXN-${seedOrd.orderNumber}`,
      orderId: createdOrder.id,
      userId: seedOrd.userId,
      provider: seedOrd.provider,
      amountRwf: total,
      status: 'COMPLETED',
      maskedAccount:
        seedOrd.provider === 'MTN_MOMO'
          ? '0788***910'
          : seedOrd.provider === 'AIRTEL_MONEY'
            ? '0732***112'
            : 'BK-****4821',
      paidAt: createdAt,
      createdAt,
    });

    await db.insert(invoices).values({
      invoiceNumber: `INV-${seedOrd.orderNumber}`,
      orderId: createdOrder.id,
      userId: seedOrd.userId,
      subtotalRwf: subtotal,
      taxRwf: tax,
      deliveryFeeRwf: deliveryFee,
      totalRwf: total,
      status: 'PAID',
      issuedAt: createdAt,
    });

    const schedDate = new Date(createdAt.getTime() + 86400000)
      .toISOString()
      .slice(0, 10);

    await db.insert(deliveries).values({
      orderId: createdOrder.id,
      trackingCode: `TRK-${seedOrd.orderNumber.slice(-4)}`,
      scheduledDate: schedDate,
      timeSlot: '09:00 - 12:00',
      driverName: seedOrd.driver,
      driverPhone: '+250 788 901 234',
      vehiclePlate: seedOrd.plate,
      status: seedOrd.deliveryStatus,
      deliveryFeeRwf: deliveryFee,
      deliveredAt: seedOrd.deliveryStatus === 'DELIVERED' ? createdAt : null,
      createdAt,
    });
  }

  // Seed a sample B2B Quotation
  const [quote] = await db
    .insert(quotations)
    .values({
      quoteNumber: 'RFQ-2026-0314',
      userId: resolvedB2B.id,
      businessAccountId: b2bAccount?.id ?? null,
      status: 'QUOTED',
      subtotalRwf: 5250000,
      discountRwf: 450000,
      totalRwf: 4800000,
      validUntil: new Date(Date.now() + 14 * 86400000),
      customerNotes: 'Phase 2 structural foundation delivery for Kigali Heights annex.',
      internalNotes: 'Approved 8.5% contract volume discount.',
      reviewedById: superAdmin.id,
    })
    .returning();

  await db.insert(quotationItems).values([
    {
      quotationId: quote.id,
      productId: prodBySku['BM-006'].id,
      quantity: 30,
      requestedPriceRwf: 92000,
      quotedPriceRwf: 93000,
      lineTotalRwf: 2790000,
    },
    {
      quotationId: quote.id,
      productId: prodBySku['EC-003'].id,
      quantity: 32,
      requestedPriceRwf: 62000,
      quotedPriceRwf: 62812,
      lineTotalRwf: 2010000,
    },
  ]);

  // Seed initial notifications
  await db.insert(notifications).values([
    {
      targetRole: 'INVENTORY_MANAGER',
      type: 'LOW_STOCK',
      title: 'Out of Stock: 12-Way DIN Distribution Circuit Breaker Box',
      message: 'SKU CB-004 has 0 units remaining. Draft PO-2026-1088 is awaiting approval.',
      linkView: 'procurement',
    },
    {
      targetRole: 'INVENTORY_MANAGER',
      type: 'LOW_STOCK',
      title: 'Low Stock Alert: Heavy-Duty 18" Forged Pipe Wrench',
      message: 'SKU PW-002 dropped to 8 units (Minimum: 10).',
      linkView: 'inventory',
    },
    {
      targetRole: 'SUPER_ADMIN',
      type: 'ORDER',
      title: 'Order #ORD-2026-1048 In Transit',
      message: 'Driver Emmanuel Habineza (RAE 412 C) departed Kigali Central Depot.',
      linkView: 'deliveries',
    },
  ]);
}
