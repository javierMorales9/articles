# Header Image Workflow

Use this guide when a post is written and the user wants a header image for it.

The default output file is:

```text
<series-folder>/postN/header_image.png
```

Use `header_image_references/` as the visual reference set for the house style.

## Goal

Create a horizontal pixel-art scene that acts as a visual metaphor for the article.

The image should not merely illustrate the topic. It should compress the article's central tension, lesson, or surprising mechanism into a memorable scene. The best image feels like a tiny editorial cartoon rendered as polished pixel art.

## Narrative Distance

By default, choose a scene that is conceptually or narratively related to the article, not a literal depiction of the technical domain.

The image should work as a standalone editorial scene even for someone who has not read the article. For example, if the article is about coordinating access to a shared resource, a nightclub queue with a bouncer can be a good metaphor. The image should still look like it could be used for a story about a nightclub bouncer, not like a technical diagram disguised as a nightclub.

Do not include explicit technical-domain elements unless the user asks for them. Avoid visible databases, code, SQL, terminals, dashboards, architecture diagrams, API labels, request labels, product names, framework names, or other literal software symbols by default.

The technical idea should influence the scene's tension, staging, and character behavior, not appear as labels or props.

## When To Create It

Create the header image after `article.md` exists, unless the user explicitly asks to explore image concepts earlier.

Before generating the image:

1. Read the target `article.md`.
2. If needed, skim `draft.md` for structure and intended emphasis.
3. Identify the article's core idea in one sentence.
4. Translate that idea into a concrete visual metaphor.
5. Generate `header_image.png` in the same `postN/` folder.

## Visual Style

Use this consistent house style:

- Pixel art, 16-bit / 32-bit inspired, polished rather than rough.
- Horizontal banner composition, preferably close to 16:9.
- One instantly readable central scene.
- Bright enough to read well in article lists and social previews.
- More 2D and graphic than cinematic: use flatter shapes, cleaner silhouettes, and limited heavy shadow.
- Expressive characters with exaggerated poses and faces.
- Clear lighting, strong silhouettes, and readable foreground/background separation.
- Rich environmental detail, but never so much that the metaphor becomes unclear.
- Slightly humorous or theatrical tone when it fits the article.
- Modern editorial feel, not generic videogame fantasy.

Avoid:

- Abstract concept art.
- Corporate stock-photo compositions.
- Flat iconography.
- Random futuristic dashboards unless the article specifically needs them.
- Text-heavy images.
- Literal screenshots of code as the main subject.
- Visible databases, code, SQL, terminals, API labels, architecture diagrams, or other explicit technical symbols unless requested.
- Bland "person at laptop" scenes.

## Text In The Image

Prefer no embedded text.

Short text is allowed only when it materially improves the metaphor, such as:

- a tiny label on a screen;
- a sign;
- a short number inside an object;
- a one- or two-word title strip if the user asks for it.

Do not put the article title in the image by default.

## Concept Selection

Pick one of these metaphor shapes:

- **Conflict**: two forces fighting over the same resource.
- **Performance**: a system succeeding or failing in front of an audience.
- **Trap**: a pleasant-looking interface hiding a dangerous mechanism.
- **Machine room**: invisible backend logic shown as physical machinery.
- **Race**: multiple actors reaching for the same thing at the same time.
- **Transformation**: a dull or broken process becoming vivid, fast, or addictive.
- **Investigation**: the author discovering the hidden cause behind a symptom.

Choose the shape that best matches the article's emotional arc, not just its technical domain.

After choosing the metaphor shape, translate it into a scene from ordinary life, work, entertainment, sport, theater, nature, or another non-technical setting unless the user explicitly asks for technical imagery.

## Prompt Template

Use this template as the starting point for image generation:

```text
Create a polished horizontal pixel-art header image, 16:9 composition, 16-bit/32-bit editorial videogame style.

Article core idea:
{one-sentence summary of the article}

Scene metaphor:
{specific scene that turns the idea into visible action}

Composition:
{main subject in the center, supporting characters/objects, foreground, background, camera angle}

Mood:
{funny, tense, triumphant, absurd, investigative, dramatic, etc.}

Important visual details:
- {detail 1}
- {detail 2}
- {detail 3}

Style constraints:
- crisp pixel art;
- bright enough for list thumbnails and social previews;
- more 2D/graphic than cinematic, with flatter shapes and limited heavy shadow;
- readable silhouettes;
- expressive faces and poses;
- rich but controlled background detail;
- warm editorial lighting;
- no photorealism;
- no flat vector art;
- no generic stock-photo look;
- no visible databases, code, SQL, terminals, API labels, architecture diagrams, or software UI unless explicitly requested;
- no large readable text unless explicitly requested.
```

## Example Concepts

For a race-condition article:

```text
Two characters grab the same donut at the same time on a small table while a cash register, scattered receipts, and a worried cashier show that only one donut was supposed to be sold.
```

For an article about making AI-assisted writing sound human:

```text
A robot opera singer performs on a grand theater stage while a human audience applauds, showing that the artificial performer can still move a real crowd.
```

For an article about finding a first profitable business idea:

```text
A founder touches his head as a glowing light bulb appears above him, with a small money symbol inside the bulb and rejected idea notes scattered on the desk.
```

For an article about addictive UX:

```text
A focused VR player leans into an intense game scene while app UI elements orbit around the headset like game rewards, suggesting product UX with game-like pull.
```

For an article about making presentations engaging:

```text
A corporate meeting room where everyone is falling asleep during a dull slide presentation, with one tiny dramatic element hinting at the presentation problem the article solves.
```

## Acceptance Checklist

Before considering the image done, check:

- The metaphor is understandable without reading the article.
- The scene matches the article's real point, not only its broad topic.
- The central action is visible at thumbnail size.
- The image stays readable in a small article list preview: bright, clear, and not overly dark or painterly.
- The image has a distinctive subject, not a generic technology scene.
- The style is recognizably pixel art.
- The final file is named `header_image.png` and lives beside the post's `article.md`.

If the first generated image is visually nice but conceptually weak, revise the prompt around the metaphor first. Style polish comes after the concept is right.
