export interface SeedCategory {
  name: string;
  description: string;
}

export interface SeedProduct {
  sku: string;
  name: string;
  description: string;
  referencePrice: string;
  minimumStock: number;
  category: string;
  /** Existencias iniciales registradas con un movimiento IN (0 = producto sin stock). */
  initialStock: number;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: 'Cables y adaptadores', description: 'Cables USB, HDMI y adaptadores de video/audio' },
  { name: 'Cargadores y baterias', description: 'Cargadores de pared, de auto y baterias externas' },
  { name: 'Audio', description: 'Audifonos, parlantes y accesorios de audio' },
  { name: 'Almacenamiento', description: 'Memorias USB, tarjetas microSD y discos externos' },
  { name: 'Proteccion y soportes', description: 'Fundas, micas y soportes para dispositivos' },
];

/** Incluye productos con stock normal, stock bajo (stock <= minimo) y stock cero. */
export const SEED_PRODUCTS: SeedProduct[] = [
  { sku: 'CAB-USBC-1M', name: 'Cable USB-C a USB-C 1 m', description: 'Trenzado, 60 W', referencePrice: '49.90', minimumStock: 10, category: 'Cables y adaptadores', initialStock: 40 },
  { sku: 'CAB-HDMI-2M', name: 'Cable HDMI 2.1 2 m', description: '8K 60 Hz', referencePrice: '89.00', minimumStock: 5, category: 'Cables y adaptadores', initialStock: 4 },
  { sku: 'ADP-USBC-HDMI', name: 'Adaptador USB-C a HDMI', description: '4K 60 Hz', referencePrice: '120.50', minimumStock: 3, category: 'Cables y adaptadores', initialStock: 0 },
  { sku: 'CHG-GAN-65W', name: 'Cargador GaN 65 W', description: '2x USB-C + 1x USB-A', referencePrice: '199.99', minimumStock: 5, category: 'Cargadores y baterias', initialStock: 15 },
  { sku: 'PWB-10000', name: 'Bateria externa 10000 mAh', description: 'Carga rapida 22.5 W', referencePrice: '159.00', minimumStock: 4, category: 'Cargadores y baterias', initialStock: 4 },
  { sku: 'AUD-TWS-PRO', name: 'Audifonos TWS Pro', description: 'Cancelacion activa de ruido', referencePrice: '349.00', minimumStock: 3, category: 'Audio', initialStock: 9 },
  { sku: 'AUD-SPK-MINI', name: 'Parlante Bluetooth mini', description: 'IPX5, 8 h de autonomia', referencePrice: '129.90', minimumStock: 2, category: 'Audio', initialStock: 0 },
  { sku: 'STO-USB-64', name: 'Memoria USB 3.2 64 GB', description: 'Lectura 150 MB/s', referencePrice: '55.00', minimumStock: 8, category: 'Almacenamiento', initialStock: 30 },
  { sku: 'STO-MSD-128', name: 'Tarjeta microSD 128 GB', description: 'Clase A2 V30', referencePrice: '98.00', minimumStock: 6, category: 'Almacenamiento', initialStock: 2 },
  { sku: 'PRT-CASE-UNI', name: 'Funda universal para tablet 10"', description: 'Con soporte plegable', referencePrice: '75.00', minimumStock: 3, category: 'Proteccion y soportes', initialStock: 12 },
  { sku: 'PRT-STAND-AL', name: 'Soporte de aluminio para laptop', description: 'Altura ajustable', referencePrice: '145.00', minimumStock: 2, category: 'Proteccion y soportes', initialStock: 6 },
];
