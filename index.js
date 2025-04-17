const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.post('/api/suggest', async (req, res) => {
  const { mood, lat, lng, lang } = req.body;

  console.log('✅ Received /api/suggest request:', { mood, lang, lat, lng });

  const userPrompt = `
User says: "${mood}"
Respond with:
1. Meal suggestion in English and Arabic (only the meal name)
2. Recipe idea in English and Arabic (if cooking at home)
Respond in format:
Meal_EN: ...
Meal_AR: ...
Recipe_EN: ...
Recipe_AR: ...
`;

  try {
    const aiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a food recommendation assistant who replies in English and Arabic.' },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 400,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const text = aiResponse.data.choices?.[0]?.message?.content?.trim();
    console.log('🧠 GPT-4o Response:', text);

    const parse = (label) =>
      text.split('\n').find((line) => line.startsWith(label))?.split(':')[1]?.trim() || '';

    const meal_en = parse('Meal_EN');
    const meal_ar = parse('Meal_AR');
    const recipe_en = parse('Recipe_EN');
    const recipe_ar = parse('Recipe_AR');

    if (!meal_en || !meal_ar || !recipe_en || !recipe_ar) {
      return res.status(500).json({
        error: 'AI response was incomplete or malformed.',
        text,
      });
    }

    const searchTerm = "restaurant " + meal_en.split(' ').slice(0, 2).join(' ');
    const mapsRes = await axios.get(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        searchTerm
      )}&location=${lat},${lng}&radius=1000&key=${process.env.GOOGLE_API_KEY}`
    );

    const places = mapsRes.data.results.slice(0, 3).map((p) => ({
      name: p.name,
      link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`
    }));

    // Search for images using Google Custom Search API
    const mealImageSearch = "meal name "+ meal_en.split(' ').slice(0, 2).join(' '); // Using first two words of the meal
    console.log('🔍 Searching for images of:', mealImageSearch);  // Debugging the image search term

    const imageRes = await axios.get(
      `https://www.googleapis.com/customsearch/v1`,
      {
        params: {
          q: mealImageSearch,  // Search term
          searchType: 'image',  // Image search type
          key: process.env.GOOGLE_API_KEY,  // Your API key
          cx: process.env.GOOGLE_CX,  // Your Custom Search Engine ID (CX)
        },
      }
    );
    

    const mealImage = imageRes.data.items?.[0]?.link || ''; // Get the first image URL
    console.log('🖼️ Meal image found:', mealImage);  // Debugging the found image URL

    const youtubeQuery = `how to make ${meal_en} site:youtube.com`;
    const searchVideoRes = await axios.get(
      'https://www.googleapis.com/customsearch/v1',
      {
        params: {
          q: youtubeQuery,
          key: process.env.GOOGLE_API_KEY,
          cx: process.env.GOOGLE_CX,
        },
      }
    );
    
    const youtubeVideo = searchVideoRes.data.items?.[0]?.link || '';
    
    // Send response with meal suggestions and image
    res.json({ meal_en, meal_ar, recipe_en, recipe_ar, places, mealImage, youtubeVideo });

  } catch (err) {
    console.error("❌ Error in /api/suggest:", err);  // Enhanced error logging
    console.error("❌ Error Message:", err.message);
    console.error("❌ Full Error:", err);

    res.status(500).json({ error: 'Failed to generate bilingual suggestion', details: err.message });
  }
});

app.listen(PORT, () => console.log(`🍽️ Nakol-Eh server running on port ${PORT}`));
