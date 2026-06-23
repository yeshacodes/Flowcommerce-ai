import { ordersApi } from '../../api/orders'
import type { CustomerOrderContext } from '../../types/customerCopilot'

export async function fetchCustomerOrderContext(orderId: string): Promise<CustomerOrderContext> {
  return ordersApi.context(orderId)
}

