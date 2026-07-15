'use server'

import { revalidateTag } from 'next/cache'

export async function revalidateCategoryCache() {
  revalidateTag('categories', 'max')
  revalidateTag('subcategories', 'max')
}
