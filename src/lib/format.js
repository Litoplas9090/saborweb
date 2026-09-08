// Helpers de formato compartidos entre páginas

export function money(n) {
  return `$ ${Number(n).toFixed(2)}`
}

// Número corto de pedido a partir del UUID
export function shortOrderId(id) {
  return `#${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
}
