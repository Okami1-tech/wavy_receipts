import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
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