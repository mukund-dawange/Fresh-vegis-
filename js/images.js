import {MAX_IMAGE_LENGTH, validateProductImage} from './store.js';

// Photos are resized on the user's device; no image is uploaded to a server.
export async function prepareProductImage(file) {
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
  if(file.size>10*1024*1024) throw new Error('Choose a photo smaller than 10 MB.');
  const url=URL.createObjectURL(file);
  try {
    const picture=new Image();picture.src=url;
    try{await picture.decode();}catch{throw new Error('This image could not be opened. Choose a different photo.');}
    if(!picture.naturalWidth||!picture.naturalHeight)throw new Error('This image has no usable dimensions.');
    const canvas=document.createElement('canvas');const context=canvas.getContext('2d');
    if(!context)throw new Error('Your browser could not prepare the photo.');
    for(const edge of [512,384,256]) {
      const scale=Math.min(1,edge/Math.max(picture.naturalWidth,picture.naturalHeight));
      canvas.width=Math.max(1,Math.round(picture.naturalWidth*scale));canvas.height=Math.max(1,Math.round(picture.naturalHeight*scale));
      context.drawImage(picture,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.68,.5]) {
        const data=canvas.toDataURL('image/webp',quality);
        if(data.length<=MAX_IMAGE_LENGTH)return validateProductImage(data);
      }
    }
    throw new Error('This photo is too detailed for local storage. Choose a smaller image.');
  }finally{URL.revokeObjectURL(url);}
}
