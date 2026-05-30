# Creating Google Play Store Assets

Quick guide to create all required assets for your Play Store listing.

## Required Assets Checklist

- [ ] App Icon 512x512 PNG
- [ ] Feature Graphic 1024x500 PNG  
- [ ] At least 2 Phone Screenshots
- [ ] Privacy Policy URL

---

## 1. App Icon (512x512 PNG)

**Requirements:**
- Size: 512x512 pixels
- Format: 32-bit PNG
- No transparency
- File: `public/playstore-icon-512.png`

**How to create:**

### Option A: From your existing logo
```bash
# If you have ImageMagick installed:
convert public/placeholder-logo.png -resize 512x512 -background white -alpha remove public/playstore-icon-512.png
```

### Option B: Use Figma/Canva
1. Create 512x512 canvas
2. Add your logo centered
3. Use solid background color (#4F46E5 or white)
4. Export as PNG

### Option C: Online tools
- [Icon Generator](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html)
- [App Icon Maker](https://appiconmaker.co/)

---

## 2. Feature Graphic (1024x500 PNG)

**Requirements:**
- Size: 1024x500 pixels
- Format: 24-bit PNG or JPEG
- This appears at the top of your Play Store listing
- File: `public/playstore-feature.png`

**Design tips:**
- Include app name "Family Graph"
- Add tagline: "Preserve Your Family Legacy"
- Show app screenshot or family tree visual
- Use brand colors (#4F46E5)
- Keep text readable on mobile

**Template idea:**
```
┌─────────────────────────────────────────────┐
│                                             │
│   [App Icon]  Family Graph                  │
│               Visualize & Preserve Your     │
│               Family Heritage               │
│                                             │
│               [Family Tree Visual]          │
│                                             │
└─────────────────────────────────────────────┘
        1024px wide × 500px tall
```

**Create with:**
- Figma/Canva (use 1024x500 template)
- Photoshop/GIMP
- Online: [Canva](https://canva.com) has Play Store templates

---

## 3. Phone Screenshots (Minimum 2)

**Requirements:**
- Format: PNG or JPEG
- Minimum dimension: 320px
- Maximum dimension: 3840px
- Aspect ratio: 16:9 to 9:16
- Recommended: 1080x1920 or 1080x2340
- Minimum: 2 screenshots
- Maximum: 8 screenshots

**What to screenshot:**

1. **Main Family Tree View**
   - Shows the interactive graph
   - Multiple family members visible
   - Clean, professional look

2. **Member Profile**
   - Individual member details
   - Photos, relationships, bio

3. **Add Member Flow** (optional)
   - Shows how easy it is to add someone

4. **Invite Screen** (optional)
   - Family collaboration feature

5. **Memory/Timeline** (optional)
   - Stories and memories feature

**How to capture:**

### Method 1: Chrome DevTools (Easiest)
```bash
1. Deploy your app or run locally: npm run dev
2. Open in Chrome: http://localhost:3000
3. Open DevTools (F12)
4. Click device toolbar icon (Ctrl+Shift+M)
5. Select device: "Pixel 5" or "iPhone 12 Pro"
6. Navigate to key screens
7. Right-click → "Capture screenshot" or use full page screenshot
```

### Method 2: Real Device
```bash
1. Open your app on Android phone
2. Navigate to screen you want
3. Press Power + Volume Down
4. Screenshots saved to Photos/Screenshots
5. Transfer to computer
```

### Method 3: Android Emulator
```bash
1. Open Android Studio
2. Create virtual device (Pixel 5, API 31+)
3. Open your PWA in Chrome
4. Use emulator screenshot button
```

**Post-processing:**
- Resize to 1080x1920 or 1080x2340
- Add device frame (optional but looks professional)
- Use [Screely](https://screely.com) or [Mockuphone](https://mockuphone.com)

**Pro tip:** Add text overlays to highlight features
- "Build Your Family Tree"
- "Invite Family Members"
- "Preserve Memories Forever"

---

## 4. Privacy Policy

**Requirements:**
- Must be hosted at a publicly accessible URL
- Must cover: data collection, usage, sharing, deletion
- Required before app submission

**You already have:** `app/(marketing)/legal/page.tsx`

**To use it:**
1. Deploy your app to production
2. Your privacy policy will be at: `https://yourdomain.com/legal`
3. Use this URL in Play Console

**What to include:**
- What data you collect (family info, photos, etc.)
- How you use it (display family tree, etc.)
- How you store it (Supabase)
- User rights (data export, deletion)
- Third-party services (Supabase, Vercel Analytics)

---

## Quick Asset Creation Workflow

### Total time: 2-4 hours

```bash
# 1. App Icon (30 mins)
# - Use Canva or Figma
# - Export as playstore-icon-512.png

# 2. Feature Graphic (1 hour)
# - Create in Canva with template
# - Export as playstore-feature.png

# 3. Screenshots (1-2 hours)
# - Start dev server
npm run dev

# - Open Chrome DevTools
# - Set device: Pixel 5 (1080x2340)
# - Navigate and screenshot these:
#   1. Dashboard/Family Tree
#   2. Member Profile
#   3. Add Member
#   4. Invite Screen

# - Save as screenshot-1.png, screenshot-2.png, etc.

# 4. Organize files
mkdir -p public/playstore-assets
mv public/playstore-icon-512.png public/playstore-assets/
mv public/playstore-feature.png public/playstore-assets/
mv screenshot-*.png public/playstore-assets/
```

---

## Asset Dimensions Quick Reference

| Asset | Size | Format | Quantity |
|-------|------|--------|----------|
| App Icon | 512×512 | PNG | 1 |
| Feature Graphic | 1024×500 | PNG/JPG | 1 |
| Phone Screenshot | 1080×1920 | PNG/JPG | 2-8 |
| Privacy Policy | - | URL | 1 |

---

## Example Asset Checklist

Before uploading to Play Console, verify:

```
public/playstore-assets/
├── playstore-icon-512.png      ✅ 512×512, PNG, <1MB
├── playstore-feature.png       ✅ 1024×500, PNG, <1MB
├── screenshot-1.png            ✅ Family tree view
├── screenshot-2.png            ✅ Member profile
├── screenshot-3.png            ✅ Add member (optional)
└── screenshot-4.png            ✅ Invite screen (optional)
```

Privacy Policy: ✅ https://familygraph.app/legal

---

## Tools & Resources

**Design Tools:**
- [Canva](https://canva.com) - Free templates
- [Figma](https://figma.com) - Professional design
- [GIMP](https://gimp.org) - Free Photoshop alternative

**Screenshot Tools:**
- Chrome DevTools (built-in)
- [Screely](https://screely.com) - Beautiful device frames
- [Mockuphone](https://mockuphone.com) - Device mockups

**Icon Tools:**
- [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/)
- [App Icon Generator](https://appicon.co/)

**Templates:**
- [Play Store Asset Templates](https://developer.android.com/distribute/marketing-tools/device-art-generator)

---

## Need Help?

Common issues:

**"Icon has transparency"**
→ Remove alpha channel, use solid background

**"Feature graphic wrong size"**
→ Must be exactly 1024×500, check dimensions

**"Screenshots too small"**
→ Minimum 320px, use 1080×1920 for best quality

**"Privacy policy not accessible"**
→ Ensure deployed and HTTPS, test in incognito browser

---

Ready to create your assets? Start with the app icon, then feature graphic, then screenshots!
