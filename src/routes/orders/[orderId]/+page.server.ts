import { db } from '#lib/server/db/index.js';
import { order } from '#lib/server/db/schema.js';
import { and, eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logger } from '#lib/server/logger.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	logger.debug({ userId: locals.user.id, orderId: params.orderId }, 'Fetching order details');

	const orderData = await db.query.order.findFirst({
		where: and(eq(order.userId, locals.user.id), eq(order.id, params.orderId)),
		with: {
			adjustments: true,
			items: {
				with: {
					book: {
						with: {
							series: {
								columns: { title: true }
							}
						}
					}
				}
			}
		}
	});

	if (!orderData) {
		logger.warn({ userId: locals.user.id, orderId: params.orderId }, 'Order not found');
		error(404, 'Order not found');
	}

	return { order: orderData };
};
