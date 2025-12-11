import { db, storage } from './firebase';
// FIX: Using firebase v8, so we need firebase instance for types.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { Campaign, Client, Submission } from '../types';
import { sanitizeFormData, sanitizeObject } from '../utils/validation';

// FIX: collection() is a method on the db object in v8.
const campaignCollection = db.collection('campaigns');
const submissionCollection = db.collection('submissions');
const clientCollection = db.collection('clients');

// FIX: doc parameter is a DocumentSnapshot in v8.
const fromFirestore = <T extends {id: string}>(doc: firebase.firestore.DocumentSnapshot): T => {
    const data = doc.data();
    return {
        id: doc.id,
        ...data
    } as T;
};

// Helper to sanitize data (remove undefined values, but keep null and empty strings)
const sanitizeData = (data: any): any => {
    const cleaned = JSON.parse(JSON.stringify(data));
    // Ensure deliveredAt is preserved even if it was null/undefined
    if (data.deliveredAt !== undefined) {
        cleaned.deliveredAt = data.deliveredAt;
    }
    return cleaned;
};

// File Upload
export const uploadFile = async (path: string, file: File): Promise<string> => {
    const storageRef = storage.ref(path);
    const metadata = {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
    };
    const snapshot = await storageRef.put(file, metadata);
    const downloadURL = await snapshot.ref.getDownloadURL();
    return downloadURL;
};

// Client Functions
export const getClients = async (): Promise<Client[]> => {
    const snapshot = await clientCollection.orderBy('name').get();
    return snapshot.docs.map(doc => fromFirestore<Client>(doc));
};

export const getClient = async (id: string): Promise<Client | null> => {
    const docRef = clientCollection.doc(id);
    const docSnap = await docRef.get();
    return docSnap.exists ? fromFirestore<Client>(docSnap) : null;
};

export const addClient = async (clientData: Omit<Client, 'id'>): Promise<string> => {
    const docRef = await clientCollection.add(clientData);
    return docRef.id;
};

export const updateClient = async (id: string, clientData: Partial<Omit<Client, 'id'>>): Promise<void> => {
    const docRef = clientCollection.doc(id);
    await docRef.update(clientData);
};

export const deleteClient = async (id: string): Promise<void> => {
    const docRef = clientCollection.doc(id);
    await docRef.delete();
};


// Campaign Functions
export const getCampaigns = async (): Promise<Campaign[]> => {
    // FIX: getDocs() is collection.get() in v8.
    const snapshot = await campaignCollection.get();
    return snapshot.docs.map(doc => fromFirestore<Campaign>(doc));
};

export const getCampaign = async (id: string): Promise<Campaign | null> => {
    // FIX: doc() and getDoc() are replaced by collection.doc().get() in v8.
    const docRef = db.collection('campaigns').doc(id);
    const docSnap = await docRef.get();
    // FIX: exists is a property in v8, not a function.
    return docSnap.exists ? fromFirestore<Campaign>(docSnap) : null;
};

export const addCampaign = async (campaignData: Omit<Campaign, 'id'>): Promise<string> => {
    // FIX: addDoc() is collection.add() in v8.
    const docRef = await campaignCollection.add(sanitizeData(campaignData));
    return docRef.id;
};

export const updateCampaign = async (id: string, campaignData: Partial<Omit<Campaign, 'id'>>): Promise<void> => {
    // FIX: doc() and updateDoc() are replaced by collection.doc().update() in v8.
    const docRef = db.collection('campaigns').doc(id);
    await docRef.update(sanitizeData(campaignData));
};

export const deleteCampaign = async (id: string): Promise<void> => {
    // 1. Delete associated submissions
    const submissionsQuery = submissionCollection.where('campaignId', '==', id);
    const submissionsSnapshot = await submissionsQuery.get();
    
    if (!submissionsSnapshot.empty) {
        const batch = db.batch();
        submissionsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    // 2. Delete the campaign
    const docRef = campaignCollection.doc(id);
    await docRef.delete();
};


// Submission Functions
export const addSubmission = async (submissionData: Omit<Submission, 'id'>): Promise<string> => {
    // FIX: addDoc() is collection.add() in v8.
    // Sanitize form data and remove undefined values before sending to Firestore
    const sanitizedFormData = submissionData.formData ? sanitizeFormData(submissionData.formData) : {};
    
    // Convert ISO strings to Firestore Timestamps for proper timezone handling
    const submittedAtTimestamp = firebase.firestore.Timestamp.fromDate(new Date(submissionData.submittedAt));
    
    // Build the data object, ensuring deliveredAt is ALWAYS included
    const dataToSave: any = {
        campaignId: submissionData.campaignId,
        submittedAt: submittedAtTimestamp, // Use Firestore Timestamp for proper timezone
        deliveryChoice: submissionData.deliveryChoice,
        formData: sanitizedFormData,
        surveyAnswers: submissionData.surveyAnswers || {},
        delivered: submissionData.delivered !== undefined ? submissionData.delivered : false,
    };
    
    // ALWAYS include deliveredAt - convert to Firestore Timestamp
    // This ensures it's always saved, even if the value is empty
    let deliveredAtTimestamp: firebase.firestore.Timestamp;
    if (submissionData.deliveredAt && submissionData.deliveredAt.trim() !== '') {
        deliveredAtTimestamp = firebase.firestore.Timestamp.fromDate(new Date(submissionData.deliveredAt));
        console.log('[firestoreService] Using provided deliveredAt:', submissionData.deliveredAt, '-> Timestamp:', deliveredAtTimestamp.toDate().toISOString());
    } else {
        // If not provided, set to 1 day from now as default
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 1);
        deliveredAtTimestamp = firebase.firestore.Timestamp.fromDate(defaultDate);
        console.log('[firestoreService] Using default deliveredAt (1 day from now):', deliveredAtTimestamp.toDate().toISOString());
    }
    dataToSave.deliveredAt = deliveredAtTimestamp; // ALWAYS set this field
    
    // Include optional fields
    if (submissionData.lineUserId) {
        dataToSave.lineUserId = submissionData.lineUserId;
    }
    
    console.log('[firestoreService] Adding submission with data:', {
        campaignId: dataToSave.campaignId,
        delivered: dataToSave.delivered,
        deliveredAt: dataToSave.deliveredAt?.toDate?.()?.toISOString() || 'MISSING',
        submittedAt: dataToSave.submittedAt?.toDate?.()?.toISOString() || 'MISSING',
    });
    
    const docRef = await submissionCollection.add(dataToSave);
    console.log('[firestoreService] Submission created with ID:', docRef.id);
    
    // Verify the data was saved correctly - read it back immediately
    const savedDoc = await docRef.get();
    const savedData = savedDoc.data();
    console.log('[firestoreService] Verified saved data:', {
        delivered: savedData?.delivered,
        deliveredAt: savedData?.deliveredAt ? (savedData.deliveredAt.toDate ? savedData.deliveredAt.toDate().toISOString() : savedData.deliveredAt) : 'MISSING',
        submittedAt: savedData?.submittedAt ? (savedData.submittedAt.toDate ? savedData.submittedAt.toDate().toISOString() : savedData.submittedAt) : 'MISSING',
    });
    
    return docRef.id;
};

export const getSubmissionsForCampaign = async (campaignId: string): Promise<Submission[]> => {
    // FIX: query() and where() are replaced by collection.where() in v8.
    const q = submissionCollection.where("campaignId", "==", campaignId);
    const snapshot = await q.get();
    return snapshot.docs.map(doc => fromFirestore<Submission>(doc));
};

export const getAllSubmissions = async (): Promise<Submission[]> => {
    // FIX: getDocs() is collection.get() in v8.
    const snapshot = await submissionCollection.get();
    return snapshot.docs.map(doc => fromFirestore<Submission>(doc));
}