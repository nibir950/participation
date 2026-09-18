# প্রথমে যেভাবে চালাবে

1. ZIP extract করে `gridwise-mern` folder VS Code-এ খোলো।
2. Node.js 22.12 বা তার পরের version install থাকতে হবে।
3. ওই folder-এর terminal-এ চালাও:

```bash
npm ci
npm run setup
npm run dev
```

Browser-এ `http://localhost:5173` খোলো। প্রথমে sample demo দেখাবে। এতে JSON-এর official interpretation নিয়ে optimizer schedule তৈরি করে—এটা real LLM run নয়।

## নিজের note দিয়ে solve করতে

Real LLM লাগবে, কারণ problem statement-এ এটি বাধ্যতামূলক। এই version-এ Ollama-এর বদলে Gemini API default করা হয়েছে। Google AI Studio থেকে Gemini API key নিয়ে root `.env` file-এর `GEMINI_API_KEY=`-এ বসাও। Free tier quota/account availability Google-এর policy অনুযায়ী প্রযোজ্য। README-এর model setup অংশ অনুসরণ করো।

Model চালু হলে **Optimize with LLM** চাপবে। এই button তোমার note model দিয়ে interpret করবে, validation করবে, তারপর schedule optimize করবে। Model connect না হলে sample demo চলবে, কিন্তু real judging endpoint সফল হবে না।

## Local history — কোনো external database লাগবে না

এই version-এ MongoDB/Atlas/SQL/Firebase/Supabase কিছুই ব্যবহার করা হয় না। `.env`-এ default রাখো:

```env
HISTORY_FILE=data/run-history.json
```

Backend নিজেই `data/run-history.json`-এ recent run save করবে। Docker ব্যবহার করলে একই data একটি local Docker volume-এ থাকবে।

## যাচাই করার command

```bash
npm test
npm run test:samples
npm run test:live
```

প্রথম দুইটি offline test। শেষটি real model দিয়ে চলমান backend test করে। দেওয়া ১০টি sample-এর optimizer cost reference-এর সঙ্গে মিলে গেছে; model-এর নিজের interpretation আলাদাভাবে live test করতে হবে।

## Submit করার আগে

শুধু ZIP submit করলেই guide-এর সব requirement পূরণ হবে না। Public API deploy, source repository, tested Docker image এবং সর্বোচ্চ ৩ মিনিটের video দরকার। `docs/SUBMISSION_CHECKLIST.md` দেখো। Model এবং Docker-এর live পরীক্ষা নিজের environment-এ সম্পন্ন করো। Local history-এর জন্য কোনো database server লাগবে না।

Project-এর flow বুঝে এবং নিজের দলের পরিবর্তন যোগ করে present করো। বিস্তারিত setup, architecture ও troubleshooting `README.md`-তে আছে।
