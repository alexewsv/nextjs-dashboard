'use server';

import { signIn } from '@/auth';
import { sql } from '@vercel/postgres';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CreateInvoiceFormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than 0' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select invoice status',
  }),
  date: z.string(),
});
const CreateInvoice = CreateInvoiceFormSchema.omit({ id: true, date: true });

export type State = {
  errors: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const rawFormDataByGet = {
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  };
  const rawFormDataByEntries = Object.fromEntries(formData.entries());

  // const parsedInvoiceData = CreateInvoice.parse(rawFormDataByEntries);
  const parsedInvoiceData = CreateInvoice.safeParse(rawFormDataByGet);

  // If form validation fails, return errors early. Otherwise, continue.
  if (!parsedInvoiceData.success) {
    return {
      errors: parsedInvoiceData.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const amountInCents = parsedInvoiceData.data.amount * 100;
  const date = new Date().toISOString().split('T')[0];
  console.log(11, {
    rawFormDataByGet,
    rawFormDataByEntries,
    parsedInvoiceData,
  });

  try {
    const ret = await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${parsedInvoiceData.data.customerId}, ${amountInCents}, ${parsedInvoiceData.data.status}, ${date})
  `;
  } catch (err) {
    return {
      message: 'Database error: failed to create invoice',
    };
  }
  // clear cache and trigger a new request to the server
  revalidatePath('/dashboard/invoices');

  // redirect user to the /dashboard/invoices to get latest data
  redirect('/dashboard/invoices');
}

// update
const UpdateInvoice = CreateInvoiceFormSchema.omit({ id: true, date: true });
export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const parsedData = UpdateInvoice.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!parsedData.success) {
    return {
      errors: parsedData.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const amountInCents = parsedData.data.amount * 100;

  console.log(22, {
    parsedData,
  });

  try {
    const ret = await sql`
    UPDATE invoices 
    SET customer_id = ${parsedData.data.customerId}, amount = ${amountInCents}, status = ${parsedData.data.status}
    WHERE 
      id = ${id}
  `;
  } catch (err) {
    return {
      message: 'Database error: failed to update invoice',
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    revalidatePath('/dashboard/invoices');
    return { message: 'Deleting invoice successfully' };
  } catch (err) {
    return { message: 'Database error: failed to delete invoice' };
  }
}

// authentication and authorization
export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
