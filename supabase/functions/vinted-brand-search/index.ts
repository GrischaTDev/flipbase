import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { searchVintedBrands } from './brand-source.ts';
import { createBrandSearchHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase configuration is missing');
}

function userClient(token: string) {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

Deno.serve(
  createBrandSearchHandler({
    async authenticate(token) {
      const { data, error } = await userClient(token).auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    async isOperator(_userId, token) {
      const { data, error } = await userClient(token).rpc('is_platform_operator');
      if (error) throw error;
      if (data !== true) return false;
      const access = await userClient(token).rpc('list_my_workspace_access');
      if (access.error) throw access.error;
      return (access.data ?? []).some(
        (row: { access_status: string }) => row.access_status === 'active',
      );
    },
    search: searchVintedBrands,
  }),
);
