const {
  base64ToArrayBuffer,
  blobToDataUrl,
  normalizeColor,
  normalizeQuality
} = PictBakeShared;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "CONVERT_IMAGE") {
    return false;
  }

  convertImage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message || "Image conversion failed."
      });
    });

  return true;
});

async function convertImage(message) {
  const sourceArrayBuffer = getSourceArrayBuffer(message.sourceArrayBuffer);
  const sourceBlob = new Blob([sourceArrayBuffer], {
    type: message.sourceMimeType || "application/octet-stream"
  });
  const targetMimeType = message.targetMimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  const jpegQuality = normalizeQuality(message.jpegQuality);
  const jpegBackgroundColor = normalizeColor(message.jpegBackgroundColor);

  let bitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch (error) {
    throw new Error("Chrome could not decode this image format. It may be unsupported, protected, or corrupt.");
  }

  try {
    if (!bitmap.width || !bitmap.height) {
      throw new Error("The decoded image has no usable dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", {
      alpha: targetMimeType !== "image/jpeg"
    });

    if (!context) {
      throw new Error("Chrome could not create a canvas context for this image.");
    }

    if (targetMimeType === "image/jpeg") {
      context.fillStyle = jpegBackgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(bitmap, 0, 0);

    const outputBlob = await canvasToBlob(
      canvas,
      targetMimeType,
      targetMimeType === "image/jpeg" ? jpegQuality : undefined
    );
    const outputDataUrl = await blobToDataUrl(outputBlob);

    return {
      ok: true,
      requestId: message.requestId,
      outputDataUrl,
      width: bitmap.width,
      height: bitmap.height,
      outputMimeType: outputBlob.type || targetMimeType,
      outputSizeBytes: outputBlob.size
    };
  } catch (error) {
    if (/canvas|allocation|memory/i.test(error.message || "")) {
      throw new Error("Chrome could not allocate enough canvas memory for this image. Try a smaller image.");
    }
    throw error;
  } finally {
    if (bitmap && bitmap.close) {
      bitmap.close();
    }
  }
}

function getSourceArrayBuffer(sourceArrayBuffer) {
  if (sourceArrayBuffer instanceof ArrayBuffer) {
    return sourceArrayBuffer;
  }

  if (sourceArrayBuffer && sourceArrayBuffer.encoding === "base64" && sourceArrayBuffer.data) {
    return base64ToArrayBuffer(sourceArrayBuffer.data);
  }

  if (Array.isArray(sourceArrayBuffer)) {
    return new Uint8Array(sourceArrayBuffer).buffer;
  }

  throw new Error("PictBake did not receive source image bytes.");
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Chrome could not encode the converted image. The image may be too large."));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    } catch (error) {
      reject(new Error("Chrome could not encode the converted image. The image may be too large."));
    }
  });
}
