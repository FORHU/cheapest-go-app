const fs = require('fs');
const content = fs.readFileSync('src/lib/server/adminActions.ts', 'utf8');

// dashboard.ts
let dashboardData = Array.from(content.matchAll(/export async function getDashboardData\(\): Promise<DashboardData> \{[\s\S]*?^}/mg));
let advancedAnalytics = Array.from(content.matchAll(/export async function getAdvancedAnalytics\(\): Promise<AdvancedAnalyticsData> \{[\s\S]*?^}/mg));
let dashboardTs = `import { createAdminClient } from '@/utils/supabase/admin';\nimport { DashboardStats, AnalyticsData, SupplierBreakdown, RecentActivity, AdvancedAnalyticsData, RevenueTrend, ConversionFunnel, RouteMetric, DashboardData } from '@/types/admin';\n\n` + dashboardData[0][0] + '\n\n' + advancedAnalytics[0][0];
fs.writeFileSync('src/lib/server/admin/dashboard.ts', dashboardTs);

// bookings.ts
let bookingsListParams = Array.from(content.matchAll(/export interface BookingsListParams \{[\s\S]*?^\}/mg));
let paginatedBookings = Array.from(content.matchAll(/export interface PaginatedBookings \{[\s\S]*?^\}/mg));
let bookingsList = Array.from(content.matchAll(/export async function getBookingsList\(params: BookingsListParams = \{\}\): Promise<PaginatedBookings> \{[\s\S]*?^}/mg));
let bookingsTs = `import { createAdminClient } from '@/utils/supabase/admin';\nimport { Booking } from '@/types/admin';\n\n` + bookingsListParams[0][0] + '\n\n' + paginatedBookings[0][0] + '\n\n' + bookingsList[0][0];
fs.writeFileSync('src/lib/server/admin/bookings.ts', bookingsTs);

// customers.ts
let customersList = Array.from(content.matchAll(/export async function getCustomersList\(\): Promise<Customer\[\]> \{[\s\S]*?^}/mg));
let customersTs = `import { createAdminClient } from '@/utils/supabase/admin';\nimport { Customer } from '@/types/admin';\n\n` + customersList[0][0];
fs.writeFileSync('src/lib/server/admin/customers.ts', customersTs);

// notifications.ts
let notifs1 = Array.from(content.matchAll(/export async function getNotifications\(\): Promise<Notification\[\]> \{[\s\S]*?^}/mg));
let notifs2 = Array.from(content.matchAll(/export async function markNotificationAsRead\(id: string\): Promise<boolean> \{[\s\S]*?^}/mg));
let notifs3 = Array.from(content.matchAll(/export async function markAllNotificationsAsRead\(\): Promise<boolean> \{[\s\S]*?^}/mg));
let notifsTs = `import { createAdminClient } from '@/utils/supabase/admin';\nimport { Notification } from '@/types/admin';\n\n` + notifs1[0][0] + '\n\n' + notifs2[0][0] + '\n\n' + notifs3[0][0];
fs.writeFileSync('src/lib/server/admin/notifications.ts', notifsTs);

// recovery.ts
let recoveryStr = content.substring(content.indexOf('// ============================================================================'));
let recoveryTs = `import { createAdminClient } from '@/utils/supabase/admin';\nimport { RecoveryActionResult } from '@/types/admin';\n\n` + recoveryStr;
fs.writeFileSync('src/lib/server/admin/recovery.ts', recoveryTs);

// index.ts
let indexTs = `export * from './dashboard';\nexport * from './bookings';\nexport * from './customers';\nexport * from './notifications';\nexport * from './recovery';\n`;
fs.writeFileSync('src/lib/server/admin/index.ts', indexTs);

console.log('Successfully created domain files');
