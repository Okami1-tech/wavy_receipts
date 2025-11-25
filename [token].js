import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token } = req.query;

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