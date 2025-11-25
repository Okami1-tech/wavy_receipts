import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Email configuration
const transporter = nodemailer.createTransporter({
  service: 'gmail', // Or another email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Frontend URL
const FRONTEND_URL = process.env.FRONTEND_URL;

// Main handler function
export default async function handler(req, res) {
  // Determine which function to run based on the x-handler header set by vercel.json
  const handlerType = req.headers['x-handler'];

  try {
    switch (handlerType) {
      case 'validate-key':
        await handleValidateKey(req, res);
        break;
      case 'receipts':
        await handleReceipts(req, res);
        break;
      case 'receipt-by-token':
        await handleReceiptByToken(req, res);
        break;
      case 'paystack-callback':
        await handlePaystackCallback(req, res);
        break;
      default:
        res.status(404).json({ message: 'Route not found' });
    }
  } catch (error) {
    console.error('Error in main handler:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// --- Individual Handler Functions ---

async function handleValidateKey(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ valid: false, message: 'Pro Key is required' });
  }

  try {
    const { data, error } = await supabase
      .from('pro_keys') // Use your actual table name
      .select('status')
      .eq('key', key)
      .single(); // Get single record

    if (error || !data || data.status !== 'active') {
      return res.status(200).json({ valid: false, message: 'Invalid or inactive Pro Key' });
    }

    res.status(200).json({ valid: true, message: 'Pro Key is valid' });

  } catch (error) {
    console.error('Error validating Pro Key:', error);
    res.status(500).json({ valid: false, message: 'Internal Server Error' });
  }
}

async function handleReceipts(req, res) {
  if (req.method === 'POST') {
    // Save receipt
    const { token, customerName, date, items, total } = req.body;
    const providedKey = req.headers.authorization?.replace('Bearer ', '');

    if (!providedKey) {
      return res.status(401).json({ error: 'Pro Key required' });
    }

    // Validate the provided key first
    const { data: keyData, error: keyError } = await supabase
      .from('pro_keys') // Use your actual table name
      .select('status')
      .eq('key', providedKey)
      .single();

    if (keyError || !keyData || keyData.status !== 'active') {
      return res.status(401).json({ error: 'Invalid or inactive Pro Key' });
    }

    try {
      const { error: insertError } = await supabase
        .from('receipts') // Use your actual table name
        .insert([{ token, customer_name: customerName, date, items, total, pro_key: providedKey }]); // Link receipt to Pro Key

      if (insertError) {
        console.error('Error saving receipt:', insertError);
        return res.status(500).json({ error: 'Failed to save receipt' });
      }

      res.status(200).json({ message: 'Receipt saved successfully' });

    } catch (error) {
      console.error('Error saving receipt:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }

  } else if (req.method === 'GET') {
    // Fetch receipts for a Pro Key
    const providedKey = req.headers.authorization?.replace('Bearer ', '');

    if (!providedKey) {
      return res.status(401).json({ error: 'Pro Key required' });
    }

    // Validate the provided key first
    const { data: keyData, error: keyError } = await supabase
      .from('pro_keys') // Use your actual table name
      .select('status')
      .eq('key', providedKey)
      .single();

    if (keyError || !keyData || keyData.status !== 'active') {
      return res.status(401).json({ error: 'Invalid or inactive Pro Key' });
    }

    try {
      const {  receipts, error: fetchError } = await supabase
        .from('receipts') // Use your actual table name
        .select('token, customer_name, date, items, total, timestamp')
        .eq('pro_key', providedKey) // Fetch only receipts for this Pro Key
        .order('timestamp', { ascending: false }); // Order by newest first

      if (fetchError) {
        console.error('Error fetching receipts:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch receipts' });
      }

      res.status(200).json(receipts);

    } catch (error) {
      console.error('Error fetching receipts:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }

  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}

async function handleReceiptByToken(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Get the token from the query parameters (as defined in vercel.json route)
  const { token } = req.query;

  if (!token || token.length !== 8) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  try {
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts') // Use your actual table name
      .select('token, customer_name, date, items, total, timestamp')
      .eq('token', token)
      .single(); // Expecting a single receipt

    if (fetchError || !receipt) {
      console.error('Error fetching receipt by token:', fetchError);
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.status(200).json(receipt);

  } catch (error) {
    console.error('Error fetching receipt by token:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function handlePaystackCallback(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { reference, status } = req.body;

  if (!reference || status !== 'success') {
    console.error('Invalid callback or payment not successful');
    return res.status(400).json({ error: 'Bad Request' });
  }

  try {
    // 1. Generate a unique Pro Key
    const proKey = `WAVY-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    // Example: WAVY-A1B2C3D4-E5F6

    // 2. Store the Pro Key in Supabase, linked to the payment reference
    const { error: insertError } = await supabase
      .from('pro_keys') // Use your actual table name
      .insert([{ key: proKey, payment_reference: reference, status: 'active', created_at: new Date().toISOString() }]);

    if (insertError) {
      console.error('Error inserting Pro Key into Supabase:', insertError);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    console.log(`Pro Key ${proKey} generated and stored for payment reference ${reference}`);

    // 3. Get customer email from Paystack (requires Paystack secret key API call)
    const customerEmail = await getCustomerEmailFromPaystack(reference);

    if (!customerEmail) {
        console.error('Could not retrieve customer email for reference:', reference);
        // Still return success to Paystack, but log the error
        return res.status(200).json({ message: 'OK' }); // Paystack expects 200
    }

    // 4. Send the Pro Key to the customer's email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: customerEmail,
      subject: 'Your Wavy Receipts Pro Key',
      text: `Thank you for your purchase! Your Pro Key is: ${proKey}. Use this key on any device to unlock Pro features.`,
      html: `<p>Thank you for your purchase!</p><p>Your Pro Key is: <strong>${proKey}</strong></p><p>Use this key on any device to unlock Pro features.</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Pro Key sent to ${customerEmail}`);

    // 5. Respond to Paystack
    res.status(200).json({ message: 'OK' });

  } catch (error) {
    console.error('Error processing Paystack callback:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Helper function to get customer email from Paystack (PSEUDO-CODE)
async function getCustomerEmailFromPaystack(reference) {
  // This is a placeholder. You need to call Paystack's API to get transaction details.
  // Example using fetch (node-fetch is built into Vercel functions)
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, // Use your Paystack secret key here
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Paystack API error: ${response.status}`);
    }

    const result = await response.json();
    if (result.status && result.data && result.data.customer) {
      return result.data.customer.email;
    } else {
      console.error('Could not get customer email from Paystack response:', result);
      return null;
    }
  } catch (error) {
    console.error('Error fetching customer email from Paystack:', error);
    return null;
  }
}