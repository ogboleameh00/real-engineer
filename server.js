
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, JPG and PNG files are allowed."));
    }

    cb(null, true);
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "HEAVENSGATE-TECH backend is running."
  });
});

app.post("/api/extract-drawing", upload.single("drawing"), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "AI service is not configured yet."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a drawing."
      });
    }

    const buffer = req.file.buffer;
    const isPDF = buffer.subarray(0, 5).toString() === "%PDF-";
    const isPNG = buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    const isJPG =
      buffer[0] === 255 &&
      buffer[1] === 216 &&
      buffer[2] === 255;

    if (!isPDF && !isPNG && !isJPG) {
      return res.status(400).json({
        error: "Invalid drawing file."
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const base64 = buffer.toString("base64");
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    const content = [
      {
        type: "input_text",
        text: `You are the architectural drawing assistant for HEAVENSGATE-TECH.

Analyze this architectural drawing carefully.

Extract only dimensions and information clearly visible in the drawing.

Look for:
- Building length and width
- Room dimensions
- Wall thicknesses
- Door and window dimensions
- Floor levels and storey information
- Other clearly labelled architectural measurements

For every extracted value, state its measurement and location in the drawing.

Never guess or invent missing dimensions.

Mark unclear values as "Needs engineer review".
Mark missing values as "Not found".

Return a clear report containing:
1. Extracted dimensions
2. Uncertain or missing information
3. Items requiring engineer confirmation

Do not calculate or approve a BOQ.
An engineer must review and approve every extracted value before it enters the calculator.`
      }
    ];

    if (isPDF) {
      content.push({
        type: "input_file",
        filename: req.file.originalname,
        file_data: dataUrl,
        detail: "high"
      });
    } else {
      content.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "high"
      });
    }

    const result = await client.responses.create({
      model: "gpt-6.1-terra",
      input: [
        {
          role: "user",
          content
        }
      ]
    });

    res.json({
      success: true,
      review_required: true,
      extracted_report: result.output_text
    });

  } catch (error) {
    console.error("Drawing extraction failed:", error.message);

    res.status(500).json({
      error: "Drawing analysis failed. Please try again."
    });
  }
});

app.use((error, req, res, next) => {
  res.status(400).json({
    error: error.message || "Invalid upload."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("HEAVENSGATE-TECH backend running on port " + PORT);
});
