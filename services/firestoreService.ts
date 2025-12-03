import { db, storage } from './firebase';
// FIX: Using firebase v8, so we need firebase instance for types.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { Campaign, Client, Submission } from '../types';

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

// Helper to sanitize data (remove undefined values)
const sanitizeData = (data: any): any => {
    return JSON.parse(JSON.stringify(data));
};

// File Upload
export const uploadFile = async (path: string, file: File): Promise<string> => {
    const storageRef = storage.ref(path);
    const snapshot = await storageRef.put(file);
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
    // Ensure data is sanitized (no undefined values) before sending to Firestore
    const cleanData = sanitizeData(submissionData);
    const docRef = await submissionCollection.add(cleanData);
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