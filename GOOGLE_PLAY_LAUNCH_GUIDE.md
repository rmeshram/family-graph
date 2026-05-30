# Google Play Launch Guide - Family Graph
## Fast Track: 1-2 Week Timeline ⚡

This guide will help you publish your Family Graph app to Google Play using the **Trusted Web Activity (TWA)** approach - the fastest way to get your existing web app on the Play Store.

---

## 📋 Quick Overview

**What is TWA?**
- Wraps your existing PWA in a native Android shell
- No code changes needed to your app
- Users get a "real" Android app experience
- Your web app continues to work normally

**Timeline Breakdown:**
- **Days 1-2**: Setup & Prerequisites
- **Days 3-5**: Build TWA and test locally
- **Days 6-8**: Prepare assets & Google Play listing
- **Days 9-10**: Submit for review
- **Days 11-17**: Google review process (3-7 days typical)

---

## ✅ Prerequisites Checklist

### 1. Google Play Developer Account ($25 one-time)
- [ ] Go to [Google Play Console](https://play.google.com/console)
- [ ] Create account and pay $25 registration fee
- [ ] Account approval takes ~48 hours

### 2. Your Website Requirements
- [ ] Must be HTTPS (✅ You're using Vercel, so you're good!)
- [ ] Domain name ready (e.g., familygraph.app)
- [ ] Privacy Policy published at a public URL

### 3. Development Tools
```bash
# Install required tools
npm install -g @bubblewrap/cli
```

---

## 🚀 Step-by-Step Build Process

### STEP 1: Fix Manifest Issues (Required for TWA)

Your current manifest has SVG icons, but Google Play requires PNG. Run:

```bash
npm run prepare:playstore
```

This script will:
1. Convert SVG icons to PNG (192x192 and 512x512)
2. Update manifest.json
3. Verify PWA score

### STEP 2: Initialize TWA with Bubblewrap

```bash
# Run this in your project root
npx @bubblewrap/cli init --manifest https://YOUR_DOMAIN.com/manifest.json
```

**You'll be prompted for:**
- Domain: `https://familygraph.app` (or your domain)
- Package name: `app.familygraph.twa` (reverse domain)
- App name: `Family Graph`
- Display mode: `standalone`
- Status bar color: `#4F46E5` (from your manifest)
- Shortcuts: `yes` (you already have them defined!)

### STEP 3: Build the Android App Bundle (AAB)

```bash
cd twa-project  # Directory created by bubblewrap init
npx @bubblewrap/cli build

# This creates: ./app-release-bundle.aab
```

### STEP 4: Generate Signing Key

```bash
# Create a keystore (keep this VERY safe!)
keytool -genkey -v -keystore family-graph-release.keystore \
  -alias family-graph -keyalg RSA -keysize 2048 -validity 10000

# You'll be prompted for:
# - Password (SAVE THIS!)
# - Your name/organization
# - Location details
```

⚠️ **CRITICAL**: Back up your keystore file and password! If you lose it, you can never update your app.

### STEP 5: Sign the AAB

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore family-graph-release.keystore \
  app-release-bundle.aab family-graph
```

---

## 🎨 Prepare Assets (Days 6-8)

### Required Assets:

#### 1. App Icon (512x512 PNG)
- [ ] Create at: `public/playstore-icon-512.png`
- High-res version of your app icon
- Must be PNG, no transparency

#### 2. Feature Graphic (1024x500 PNG)
- [ ] Create at: `public/playstore-feature.png`
- Promotional banner for store listing
- Shows at top of your Play Store page

#### 3. Screenshots (At least 2)
- [ ] Phone screenshots: 16:9 ratio
- Minimum 2, maximum 8
- Recommended: 1080x1920 or 1080x2340
- Show key features: family tree, member profiles, etc.

#### 4. Privacy Policy
- [ ] Published at public URL
- [ ] Check your `/legal` page is accessible
- Should cover: data collection, storage, sharing, deletion

**Quick Asset Creation Tips:**
```bash
# Use your browser dev tools to take screenshots
# 1. Open https://your-domain.com
# 2. Set mobile viewport (360x800 or 390x844)
# 3. Take screenshots of:
#    - Main family tree view
#    - Member profile
#    - Add member flow
#    - Invite screen
```

---

## 📝 Google Play Console Setup (Days 8-9)

### 1. Create New App
1. Go to [Play Console](https://play.google.com/console)
2. Click "Create App"
3. Fill in:
   - App name: **Family Graph**
   - Default language: **English (United States)**
   - App type: **App**
   - Free or Paid: **Free**

### 2. Store Listing
Fill out these sections:

**App Details:**
- Short description (80 chars max):
  ```
  Visualize & preserve your family heritage across generations with AI insights
  ```

- Full description (4000 chars max):
  ```
  Family Graph helps you build, visualize, and preserve your family story across generations.
  
  ✨ KEY FEATURES:
  • Interactive family tree visualization
  • Add unlimited family members
  • Preserve memories and stories
  • Invite family to collaborate
  • AI-powered relationship insights
  • Cultural features: gotra, subcaste tracking
  • Birthday & anniversary reminders
  
  Perfect for Indian families wanting to preserve their heritage and stay connected.
  
  Free during beta - start building your family legacy today!
  ```

**Graphics:**
- Upload app icon (512x512)
- Upload feature graphic (1024x500)
- Upload at least 2 phone screenshots

**Categorization:**
- App category: **Lifestyle** or **Social**
- Tags: family, genealogy, family tree

**Contact Details:**
- Email: your-email@example.com
- Privacy policy URL: https://familygraph.app/legal

### 3. Content Rating
1. Click "Start Questionnaire"
2. Select category: **Social** or **Utility**
3. Answer questions honestly
4. Submit for rating (instant)

### 4. App Content
- [ ] Privacy Policy URL
- [ ] Target audience: Ages 13+ (or All ages)
- [ ] Declare if you collect user data (Yes - family info)
- [ ] Data safety section (describe what you collect)

### 5. Pricing & Distribution
- [ ] Free app
- [ ] Select countries (start with India, US, or Worldwide)
- [ ] Acknowledge content guidelines

---

## 📦 Upload & Release (Day 9-10)

### 1. Create Release
1. Go to "Release" → "Production"
2. Click "Create new release"
3. Upload your signed AAB file

### 2. Configure Release
- Release name: `1.0.0` (or your version)
- Release notes:
  ```
  Initial release of Family Graph!
  
  • Build your interactive family tree
  • Add and manage family members
  • Invite family to join
  • Preserve memories and stories
  • AI-powered insights
  
  Free during beta. We'd love your feedback!
  ```

### 3. Submit for Review
- Review everything one last time
- Click "Submit for Review"

**What happens next:**
- Google reviews your app (3-7 days typical)
- You'll get email updates on status
- May need to address feedback
- Once approved, app goes live!

---

## 🧪 Testing Before Submit

### Test Your TWA Locally

```bash
# Install on connected Android device or emulator
cd twa-project
npx @bubblewrap/cli install

# App will launch on your device
# Test all key features:
# - Login/signup
# - Family tree loads
# - Add members works
# - Navigation is smooth
```

### Test Checklist:
- [ ] App launches without errors
- [ ] Login/authentication works
- [ ] Family tree renders correctly
- [ ] All navigation works
- [ ] Back button behaves correctly
- [ ] Deep links work (if any)
- [ ] Service worker caches properly

---

## ⏱️ Realistic Timeline

| Day | Task | Time |
|-----|------|------|
| 1-2 | Google Play account setup & approval | 2 days |
| 3 | Fix manifest, install tools | 2-3 hours |
| 4 | Build TWA, generate signing key | 2-3 hours |
| 5 | Test on device, fix issues | 3-4 hours |
| 6-7 | Create assets (screenshots, graphics) | 4-6 hours |
| 8 | Fill out Play Console listing | 2-3 hours |
| 9 | Final build & upload | 1-2 hours |
| 10 | Submit for review | 30 min |
| 11-17 | Google review process | 3-7 days |
| **Total** | **~1-2 weeks** | **~20 hours work** |

---

## 🔧 Troubleshooting

### Common Issues:

**"App not installable"**
- Check manifest start_url is correct
- Verify HTTPS certificate is valid
- Ensure all icons are PNG (not SVG)

**"Digital Asset Links not verified"**
- Wait 24-48 hours after first upload
- Check assetlinks.json is accessible at: `https://yourdomain.com/.well-known/assetlinks.json`
- Bubblewrap creates this automatically

**"Service worker not working"**
- Check service worker is registered correctly
- Test in Chrome DevTools → Application → Service Workers
- Verify caching strategy doesn't break auth

---

## 📞 Next Steps After Launch

1. **Monitor reviews** - Respond within 48 hours
2. **Track analytics** - Check Play Console metrics
3. **Iterate** - Fix bugs, add features based on feedback
4. **Update regularly** - At least every 2-3 months
5. **Promote** - Share on social media, family groups

---

## 🎯 Success Metrics to Track

Week 1-2:
- Installation rate
- Crash-free rate (target: >99%)
- User retention (Day 1, Day 7)

Month 1:
- Active users
- Family trees created
- Members added
- User feedback/reviews

---

## 💡 Pro Tips

1. **Start with limited countries** - Launch in India first, expand later
2. **Use Closed Testing** - Test with 10-20 family members before public launch
3. **Enable pre-registration** - Build hype before launch
4. **Respond to reviews** - Builds trust and improves ranking
5. **Update manifest carefully** - Changes require new TWA build

---

## 📚 Resources

- [TWA Documentation](https://developer.chrome.com/docs/android/trusted-web-activity/)
- [Bubblewrap CLI Guide](https://github.com/GoogleChromeLabs/bubblewrap)
- [Play Console Help](https://support.google.com/googleplay/android-developer)
- [PWA Best Practices](https://web.dev/pwa-checklist/)

---

**Ready to start? Run the setup script below!** 👇
