import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

export interface Student {
  uid: string;
  name: string;
  email: string;
}

export const MeetingService = {
  /**
   * Creates a new meeting and "sends" invites to all registered students.
   */
  async createMeetingAndInviteAll(hostUid: string, hostName: string, roomCode: string) {
    const meetingLink = `${window.location.origin}?room=${roomCode}`;
    
    try {
      // 1. Create the meeting document
      const meetingRef = await addDoc(collection(db, 'meetings'), {
        id: roomCode,
        hostUid,
        hostName,
        link: meetingLink,
        createdAt: new Date().toISOString(),
        status: 'active'
      });

      // 2. Fetch all registered students
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      const students: Student[] = [];
      studentsSnapshot.forEach(doc => {
        students.push(doc.data() as Student);
      });

      // 3. "Send" invites (create invite records in Firestore)
      // In a real app, this would trigger a Cloud Function or email service.
      const invitePromises = students.map(student => {
        return addDoc(collection(db, 'invites'), {
          meetingId: roomCode,
          studentEmail: student.email,
          sentAt: new Date().toISOString(),
          status: 'sent'
        });
      });

      await Promise.all(invitePromises);

      console.log(`Meeting created and ${students.length} students invited!`);
      return { meetingRef, invitedCount: students.length };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'meetings/invites');
    }
  },

  /**
   * Helper to register a student (for testing purposes)
   */
  async registerStudent(student: Student) {
    try {
      await addDoc(collection(db, 'students'), {
        ...student,
        registeredAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'students');
    }
  }
};
