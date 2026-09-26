#!/usr/bin/env python3
"""Merge video-urls.json (from browser scraper) into data/math.json"""
import json, sys, io, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

MATH_JSON    = r"D:\Claude Code\Ajnunu\data\math.json"
VIDEO_URLS   = r"D:\Claude Code\Ajnunu\video-urls.json"  # downloaded file

if not os.path.exists(VIDEO_URLS):
    print(f"ERROR: {VIDEO_URLS} not found")
    print("  1. Run scrape_videos.js in Chrome DevTools on ajnunu.com")
    print("  2. Move the downloaded video-urls.json to D:\\Claude Code\\Ajnunu\\")
    sys.exit(1)

with open(MATH_JSON, encoding='utf-8') as f:
    data = json.load(f)
with open(VIDEO_URLS, encoding='utf-8') as f:
    urls = json.load(f)  # {courseId: {videoId: m3u8Url}}

merged = 0
for sec in data['sections']:
    for course in sec['courses']:
        cid = str(course['id'])
        if cid not in urls:
            continue
        course_urls = urls[cid]
        for lesson in course['lessons']:
            vid = str(lesson['v'])
            if vid in course_urls and course_urls[vid]:
                lesson['u'] = course_urls[vid]
                merged += 1

with open(MATH_JSON, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

import os
size = os.path.getsize(MATH_JSON)
print(f"Merged {merged} video URLs into math.json ({size:,} bytes)")
