#pragma once
void ramp(FOVI vi_ramp, FOVI_VRNG v_range, FOVI_IRNG i_range, int interval, FOVI vi_cap, std::map<int, map<int, double>> &result,
	double step, double start1 = 9999.9, double stop1 = 9999.9, double start2 = 9999.9, double stop2 = 9999.9, double start3 = 9999.9, double stop3 = 9999.9, double start4 = 9999.9, double stop4 = 9999.9,
	double start5 = 9999.9, double stop5 = 9999.9, double start6 = 9999.9, double stop6 = 9999.9, double start7 = 9999.9, double stop7 = 9999.9, double start8 = 9999.9, double stop8 = 9999.9, double start9 = 9999.9, double stop9 = 9999.9,
	double start10 = 9999.9, double stop10 = 9999.9, double start11 = 9999.9, double stop11 = 9999.9, double start12 = 9999.9, double stop12 = 9999.9);
void FV_SAMETIME(FOVI vi_ramp1, FOVI vi_ramp2, FOVI vi_ramp3, FOVI_VRNG v_range, FOVI_IRNG i_range, double step, double start, double stop);

void power_off_fovi();

void measure_BG(TRIM_NODE *trim_node, TREG_MEASURE_FLAG treg_measure_flag, double *results);
bool active_site(int site);


// HL7139's routine
extern void Powerup();
extern void Poweroff();

extern void Enter_test_mode();
extern void I2Cread(int I2CREG, double  *readvale);

extern void DIO_I2C_Init(float Period, float VIH, float VIL, float VOH, float VOL);
extern void DIO_Scan_Init(float Period, float VIH, float VIL, float VOH, float VOL);
extern void HL7139_PreLoad();
extern void PowerOff();
extern void PowerOn();

extern int force_trim;
extern void MyCbitOn( short relay_S1, short relay_S2,... );
extern void MyCbitOff( short relay_S1, short relay_S2,... );


extern void OTP_Preview(BYTE SlaveAddress, BYTE RegAddress, const char* reg_str);
extern void OTP_Preview_Byte(BYTE SlaveAddress, BYTE RegAddress, const char* reg_str);
extern void OTP_Preview_Byte(BYTE SlaveAddress, BYTE RegAddress1, const char* reg_str1, BYTE RegAddress2, const char* reg_str2 );

extern void OTP_Preview_All(BYTE SlaveAddress);
extern void OTP_Preview_ref(BYTE SlaveAddress);
extern void OTP_Preview_iref(BYTE SlaveAddress);
extern void OTP_Preview_osc(BYTE SlaveAddress);

extern void writeToTimeCsv(const std::string& testName, double start_time);
extern void clearTimeCsv();