import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
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
      const { data: receipts, error: fetchError } = await supabase
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