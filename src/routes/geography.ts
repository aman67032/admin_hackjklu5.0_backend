import { Router, Response } from 'express';
import Team from '../models/Team';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// City-to-State mapping for Indian cities
const cityToState: Record<string, string> = {
    // Rajasthan
    'jaipur': 'Rajasthan', 'jodhpur': 'Rajasthan', 'udaipur': 'Rajasthan', 'kota': 'Rajasthan',
    'ajmer': 'Rajasthan', 'bikaner': 'Rajasthan', 'alwar': 'Rajasthan', 'bharatpur': 'Rajasthan',
    'sikar': 'Rajasthan', 'pali': 'Rajasthan', 'tonk': 'Rajasthan', 'chittorgarh': 'Rajasthan',
    'bhilwara': 'Rajasthan', 'nagaur': 'Rajasthan', 'jhunjhunu': 'Rajasthan', 'banswara': 'Rajasthan',
    'kishangarh': 'Rajasthan', 'beawar': 'Rajasthan', 'hanumangarh': 'Rajasthan', 'sri ganganagar': 'Rajasthan',
    'ganganagar': 'Rajasthan', 'barmer': 'Rajasthan', 'jaisalmer': 'Rajasthan', 'dausa': 'Rajasthan',
    'sawai madhopur': 'Rajasthan', 'churu': 'Rajasthan', 'dungarpur': 'Rajasthan', 'bundi': 'Rajasthan',
    'pratapgarh': 'Rajasthan', 'rajsamand': 'Rajasthan', 'sirohi': 'Rajasthan', 'jalore': 'Rajasthan',
    'mount abu': 'Rajasthan', 'pushkar': 'Rajasthan', 'dholpur': 'Rajasthan', 'karauli': 'Rajasthan',
    'baran': 'Rajasthan', 'jhalawar': 'Rajasthan',
    // Delhi
    'delhi': 'Delhi', 'new delhi': 'Delhi', 'noida': 'Uttar Pradesh', 'greater noida': 'Uttar Pradesh',
    // Maharashtra
    'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra', 'nashik': 'Maharashtra',
    'aurangabad': 'Maharashtra', 'thane': 'Maharashtra', 'kolhapur': 'Maharashtra', 'solapur': 'Maharashtra',
    'navi mumbai': 'Maharashtra', 'sangli': 'Maharashtra', 'ahmednagar': 'Maharashtra',
    // Karnataka
    'bangalore': 'Karnataka', 'bengaluru': 'Karnataka', 'mysore': 'Karnataka', 'mysuru': 'Karnataka',
    'hubli': 'Karnataka', 'mangalore': 'Karnataka', 'mangaluru': 'Karnataka', 'belgaum': 'Karnataka',
    'belagavi': 'Karnataka', 'davangere': 'Karnataka', 'bellary': 'Karnataka',
    // Tamil Nadu
    'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu', 'madurai': 'Tamil Nadu', 'tiruchirappalli': 'Tamil Nadu',
    'salem': 'Tamil Nadu', 'tirunelveli': 'Tamil Nadu', 'erode': 'Tamil Nadu', 'vellore': 'Tamil Nadu',
    'thanjavur': 'Tamil Nadu', 'tiruppur': 'Tamil Nadu',
    // Telangana
    'hyderabad': 'Telangana', 'warangal': 'Telangana', 'nizamabad': 'Telangana', 'karimnagar': 'Telangana',
    'secunderabad': 'Telangana',
    // Andhra Pradesh
    'visakhapatnam': 'Andhra Pradesh', 'vijayawada': 'Andhra Pradesh', 'guntur': 'Andhra Pradesh',
    'nellore': 'Andhra Pradesh', 'kurnool': 'Andhra Pradesh', 'tirupati': 'Andhra Pradesh',
    'amaravati': 'Andhra Pradesh', 'kakinada': 'Andhra Pradesh', 'rajahmundry': 'Andhra Pradesh',
    // Uttar Pradesh
    'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'agra': 'Uttar Pradesh', 'varanasi': 'Uttar Pradesh',
    'allahabad': 'Uttar Pradesh', 'prayagraj': 'Uttar Pradesh', 'meerut': 'Uttar Pradesh', 'bareilly': 'Uttar Pradesh',
    'aligarh': 'Uttar Pradesh', 'moradabad': 'Uttar Pradesh', 'ghaziabad': 'Uttar Pradesh',
    'gorakhpur': 'Uttar Pradesh', 'faizabad': 'Uttar Pradesh', 'jhansi': 'Uttar Pradesh',
    'mathura': 'Uttar Pradesh', 'saharanpur': 'Uttar Pradesh', 'firozabad': 'Uttar Pradesh',
    'muzaffarnagar': 'Uttar Pradesh', 'shahjahanpur': 'Uttar Pradesh', 'rampur': 'Uttar Pradesh',
    'ayodhya': 'Uttar Pradesh', 'sambhal': 'Uttar Pradesh', 'amroha': 'Uttar Pradesh',
    'hardoi': 'Uttar Pradesh', 'fatehpur': 'Uttar Pradesh', 'raebareli': 'Uttar Pradesh',
    'sultanpur': 'Uttar Pradesh', 'sitapur': 'Uttar Pradesh', 'bahraich': 'Uttar Pradesh',
    'unnao': 'Uttar Pradesh', 'lakhimpur': 'Uttar Pradesh', 'banda': 'Uttar Pradesh',
    'budaun': 'Uttar Pradesh', 'etawah': 'Uttar Pradesh', 'mainpuri': 'Uttar Pradesh',
    // Gujarat
    'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'vadodara': 'Gujarat', 'rajkot': 'Gujarat',
    'gandhinagar': 'Gujarat', 'bhavnagar': 'Gujarat', 'jamnagar': 'Gujarat', 'junagadh': 'Gujarat',
    'anand': 'Gujarat', 'nadiad': 'Gujarat', 'mehsana': 'Gujarat', 'morbi': 'Gujarat',
    'bharuch': 'Gujarat', 'gandhidham': 'Gujarat',
    // Madhya Pradesh
    'bhopal': 'Madhya Pradesh', 'indore': 'Madhya Pradesh', 'jabalpur': 'Madhya Pradesh', 'gwalior': 'Madhya Pradesh',
    'ujjain': 'Madhya Pradesh', 'sagar': 'Madhya Pradesh', 'dewas': 'Madhya Pradesh', 'satna': 'Madhya Pradesh',
    'ratlam': 'Madhya Pradesh', 'rewa': 'Madhya Pradesh', 'murwara': 'Madhya Pradesh', 'singrauli': 'Madhya Pradesh',
    'burhanpur': 'Madhya Pradesh', 'khandwa': 'Madhya Pradesh', 'bhind': 'Madhya Pradesh', 'chhindwara': 'Madhya Pradesh',
    // West Bengal
    'kolkata': 'West Bengal', 'howrah': 'West Bengal', 'durgapur': 'West Bengal', 'asansol': 'West Bengal',
    'siliguri': 'West Bengal', 'kharagpur': 'West Bengal', 'darjeeling': 'West Bengal',
    // Bihar
    'patna': 'Bihar', 'gaya': 'Bihar', 'bhagalpur': 'Bihar', 'muzaffarpur': 'Bihar',
    'purnia': 'Bihar', 'darbhanga': 'Bihar', 'arrah': 'Bihar', 'begusarai': 'Bihar',
    // Haryana
    'gurugram': 'Haryana', 'gurgaon': 'Haryana', 'faridabad': 'Haryana', 'panipat': 'Haryana',
    'ambala': 'Haryana', 'karnal': 'Haryana', 'hisar': 'Haryana', 'rohtak': 'Haryana',
    'sonipat': 'Haryana', 'panchkula': 'Haryana', 'yamunanagar': 'Haryana', 'bhiwani': 'Haryana',
    'rewari': 'Haryana', 'sirsa': 'Haryana', 'jind': 'Haryana', 'kaithal': 'Haryana',
    // Punjab
    'chandigarh': 'Punjab', 'ludhiana': 'Punjab', 'amritsar': 'Punjab', 'jalandhar': 'Punjab',
    'patiala': 'Punjab', 'bathinda': 'Punjab', 'mohali': 'Punjab', 'pathankot': 'Punjab',
    'hoshiarpur': 'Punjab', 'moga': 'Punjab',
    // Kerala
    'kochi': 'Kerala', 'thiruvananthapuram': 'Kerala', 'kozhikode': 'Kerala', 'thrissur': 'Kerala',
    'kollam': 'Kerala', 'palakkad': 'Kerala', 'alappuzha': 'Kerala', 'kannur': 'Kerala',
    // Odisha
    'bhubaneswar': 'Odisha', 'cuttack': 'Odisha', 'rourkela': 'Odisha', 'berhampur': 'Odisha',
    // Assam
    'guwahati': 'Assam', 'silchar': 'Assam', 'dibrugarh': 'Assam', 'jorhat': 'Assam',
    // Jharkhand
    'ranchi': 'Jharkhand', 'jamshedpur': 'Jharkhand', 'dhanbad': 'Jharkhand', 'bokaro': 'Jharkhand',
    // Chhattisgarh
    'raipur': 'Chhattisgarh', 'bhilai': 'Chhattisgarh', 'bilaspur': 'Chhattisgarh', 'korba': 'Chhattisgarh',
    // Uttarakhand
    'dehradun': 'Uttarakhand', 'haridwar': 'Uttarakhand', 'rishikesh': 'Uttarakhand', 'roorkee': 'Uttarakhand',
    'haldwani': 'Uttarakhand', 'rudrapur': 'Uttarakhand', 'kashipur': 'Uttarakhand', 'nainital': 'Uttarakhand',
    // Himachal Pradesh
    'shimla': 'Himachal Pradesh', 'dharamshala': 'Himachal Pradesh', 'solan': 'Himachal Pradesh',
    'mandi': 'Himachal Pradesh', 'kullu': 'Himachal Pradesh', 'manali': 'Himachal Pradesh',
    // Goa
    'panaji': 'Goa', 'margao': 'Goa', 'vasco da gama': 'Goa', 'mapusa': 'Goa',
    // Tripura
    'agartala': 'Tripura',
    // Meghalaya
    'shillong': 'Meghalaya',
    // Manipur
    'imphal': 'Manipur',
    // Mizoram
    'aizawl': 'Mizoram',
    // Nagaland
    'kohima': 'Nagaland', 'dimapur': 'Nagaland',
    // Arunachal Pradesh
    'itanagar': 'Arunachal Pradesh',
    // Sikkim
    'gangtok': 'Sikkim',
    // Jammu & Kashmir
    'srinagar': 'Jammu & Kashmir', 'jammu': 'Jammu & Kashmir',
    // Ladakh
    'leh': 'Ladakh',
};

function resolveState(city: string): string {
    if (!city) return 'Unknown';
    const normalized = city.trim().toLowerCase();
    return cityToState[normalized] || 'Other';
}

// GET /api/geography — geography-based registration stats
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const teams = await Team.find().select('leaderCity leaderCollege members.city members.college');

        const stateCount: Record<string, number> = {};
        const stateCities: Record<string, Record<string, number>> = {};

        const processCity = (city: string) => {
            if (!city || city === 'N/A' || city === 'Unknown') return;
            const state = resolveState(city);
            stateCount[state] = (stateCount[state] || 0) + 1;
            if (!stateCities[state]) stateCities[state] = {};
            const normalizedCity = city.trim();
            stateCities[state][normalizedCity] = (stateCities[state][normalizedCity] || 0) + 1;
        };

        teams.forEach((team: any) => {
            processCity(team.leaderCity);
            team.members?.forEach((m: any) => {
                processCity(m.city);
            });
        });

        // Sort states by count descending
        const sortedStates = Object.entries(stateCount)
            .sort((a, b) => b[1] - a[1])
            .map(([state, count]) => ({
                state,
                count,
                cities: Object.entries(stateCities[state] || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([city, cityCount]) => ({ city, count: cityCount })),
            }));

        const totalMapped = Object.values(stateCount).reduce((a, b) => a + b, 0);

        res.json({
            totalParticipants: totalMapped,
            states: sortedStates,
        });
    } catch (error) {
        console.error('Geography stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
});

export default router;
