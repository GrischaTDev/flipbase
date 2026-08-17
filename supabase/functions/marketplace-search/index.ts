// Supabase Edge Function: marketplace-search
// Handles live server-side search for eBay Sold items, Kleinanzeigen, and real marketplace listings
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, limit = 8, platform = 'ebay_sold' } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query parameter required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ebayAppId = Deno.env.get('EBAY_APP_ID') || '';
    const items = [];

    // 1. If eBay Developer Key is present in environment, query Finding API directly
    if (ebayAppId) {
      try {
        const ebayUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${ebayAppId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(query)}&GLOBAL-ID=EBAY-DE&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&paginationInput.entriesPerPage=${limit}`;
        const resp = await fetch(ebayUrl);
        if (resp.ok) {
          const json = await resp.json();
          const ebayResults = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
          for (const it of ebayResults) {
            items.push({
              itemId: it.itemId?.[0],
              title: it.title?.[0],
              price: parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || '0'),
              currency: it.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'EUR',
              imageUrl: it.galleryURL?.[0], // Original seller photograph!
              viewItemURL: it.viewItemURL?.[0],
              endTime: it.listingInfo?.[0]?.endTime?.[0],
              conditionDisplayName: it.condition?.[0]?.conditionDisplayName?.[0] || 'Gebraucht',
            });
          }
        }
      } catch (err) {
        console.error('eBay Finding API error:', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        query,
        count: items.length,
        items,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
