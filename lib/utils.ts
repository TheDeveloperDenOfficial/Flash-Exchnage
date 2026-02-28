// lib/utils.ts

export function generateOrderId(): string {
  return `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}
